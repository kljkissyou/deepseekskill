# md2docx-multicolor.ps1 — 多色 Markdown → .docx 转换器（讲师授课版专用）
# 用法: powershell -NoProfile -ExecutionPolicy Bypass -File md2docx-multicolor.ps1 -MdPath xxx.md -OutPath xxx.docx
# 颜色标记（用 HTML 色值）:
#   彩色标记（双语法等价）：[[紫|...]] 或 {{紫|...}}  紫色 7030A0 —— 台词/对话（紫色加粗）
#   {{红|...}}  红色 C00000 —— ⭐重点/标星文字
#   {{橙|...}}  橙色 ED7D31 —— 表演/钩子内容
#   {{绿|...}}  深绿 2E7D32 —— 表演目的/勾子点
#   {{蓝|...}}  蓝色 1F4E79 —— 台词/提示词/引用
#   **...**      黑色加粗
param(
    [Parameter(Mandatory=$true)][string]$MdPath,
    [Parameter(Mandatory=$true)][string]$OutPath,
    [switch]$Landscape
)

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function ConvertTo-HtmlEncoded([string]$s) {
    return [System.Net.WebUtility]::HtmlEncode($s)
}

# --- 行内标记转 run 序列：[[色|文字]] / {{色|文字}} / **粗** ---
#     两种彩色写法等价：[[红|文字]]（v3.01 预设默认）与 {{红|文字}}（历史兼容）
function ConvertTo-Runs([string]$text) {
    if ($null -eq $text) { return '' }
    $xml = ConvertTo-HtmlEncoded $text
    $runs = New-Object System.Text.StringBuilder
    $pos = 0
    # 匹配 [[色|文字]] / {{色|文字}} / **粗**，取最早者
    while ($pos -lt $xml.Length) {
        $m = [regex]::Match($xml.Substring($pos), '(\{\{(.+?)\|(.+?)\}\})|(\[\[(.+?)\|(.+?)\]\])|(\*\*(.+?)\*\*)')
        if (-not $m.Success) { break }
        $start = $pos + $m.Index
        if ($start -gt $pos) {
            [void]$runs.Append('<w:r><w:t xml:space="preserve">' + $xml.Substring($pos, $start - $pos) + '</w:t></w:r>')
        }
        if ($m.Groups[1].Success -or $m.Groups[4].Success) {
            if ($m.Groups[1].Success) { $color = $m.Groups[2].Value; $txt = $m.Groups[3].Value }
            else { $color = $m.Groups[5].Value; $txt = $m.Groups[6].Value }
            switch ($color) {
                '紫' { $hex = '7030A0' }
                '红' { $hex = 'C00000' }
                '橙' { $hex = 'ED7D31' }
                '绿' { $hex = '2E7D32' }
                '蓝' { $hex = '1F4E79' }
                default { $hex = '000000' }
            }
            [void]$runs.Append('<w:r><w:rPr><w:b/><w:color w:val="' + $hex + '"/></w:rPr><w:t xml:space="preserve">' + $txt + '</w:t></w:r>')
            $pos = $start + $m.Length
        }
        elseif ($m.Groups[7].Success) {
            [void]$runs.Append('<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">' + $m.Groups[8].Value + '</w:t></w:r>')
            $pos = $start + $m.Length
        }
    }
    if ($pos -lt $xml.Length) {
        [void]$runs.Append('<w:r><w:t xml:space="preserve">' + $xml.Substring($pos) + '</w:t></w:r>')
    }
    if ($runs.Length -eq 0) {
        [void]$runs.Append('<w:r><w:t xml:space="preserve">' + $xml + '</w:t></w:r>')
    }
    return $runs.ToString()
}

function New-Cell([string]$content, [bool]$header) {
    $runs = ConvertTo-Runs $content
    if ($header) {
        return '<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr>' + $runs + '</w:p></w:tc>'
    }
    return '<w:tc><w:p>' + $runs + '</w:p></w:tc>'
}

function Get-CellsFromLine([string]$line) {
    $l = $line.Trim()
    if (-not $l.StartsWith('|')) { return @() }
    $l = $l.TrimStart('|').TrimEnd('|')
    return @($l -split '\|' | ForEach-Object { $_.Trim() })
}

$lines = Get-Content -Path $MdPath -Encoding UTF8
$body = New-Object System.Text.StringBuilder
$i = 0
$inTable = $false
$tableRows = New-Object System.Collections.ArrayList

function Flush-Table {
    if ($script:inTable -and $script:tableRows.Count -gt 0) {
        $headerRow = $script:tableRows[0]
        $dataStart = 1
        if ($script:tableRows.Count -gt 1) {
            $sep = Get-CellsFromLine $script:tableRows[1]
            $isSep = ($sep.Count -gt 0) -and (($sep | Where-Object { $_ -notmatch '^-{2,}$' }).Count -eq 0)
            if ($isSep) { $dataStart = 2 }
        }
        $tbl = New-Object System.Text.StringBuilder
        [void]$tbl.Append('<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders></w:tblPr>')
        $hCells = Get-CellsFromLine $headerRow
        [void]$tbl.Append('<w:tr>')
        foreach ($c in $hCells) { [void]$tbl.Append((New-Cell $c $true)) }
        [void]$tbl.Append('</w:tr>')
        for ($r = $dataStart; $r -lt $script:tableRows.Count; $r++) {
            $cells = Get-CellsFromLine $script:tableRows[$r]
            if ($cells.Count -eq 0) { continue }
            [void]$tbl.Append('<w:tr>')
            foreach ($c in $cells) { [void]$tbl.Append((New-Cell $c $false)) }
            [void]$tbl.Append('</w:tr>')
        }
        [void]$tbl.Append('</w:tbl>')
        [void]$script:body.AppendLine($tbl.ToString())
        [void]$script:body.AppendLine('<w:p/>')
        $script:tableRows.Clear()
    }
    $script:inTable = $false
}

while ($i -lt $lines.Count) {
    $line = $lines[$i]
    $trim = $line.Trim()
    if ($trim -match '^\|') {
        if (-not $inTable) { Flush-Table; $inTable = $true }
        [void]$tableRows.Add($line)
        $i++
        continue
    }
    Flush-Table
    if ($trim -eq '') {
        [void]$body.AppendLine('<w:p/>')
    }
    elseif ($trim -match '^# ') {
        $t = $trim -replace '^# ', ''
        [void]$body.AppendLine('<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>' + (ConvertTo-Runs $t) + '</w:p>')
    }
    elseif ($trim -match '^## ') {
        $t = $trim -replace '^## ', ''
        [void]$body.AppendLine('<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>' + (ConvertTo-Runs $t) + '</w:p>')
    }
    elseif ($trim -match '^### ') {
        $t = $trim -replace '^### ', ''
        [void]$body.AppendLine('<w:p><w:pPr><w:pStyle w:val="Heading3"/></w:pPr>' + (ConvertTo-Runs $t) + '</w:p>')
    }
    elseif ($trim -match '^#### ') {
        $t = $trim -replace '^#### ', ''
        [void]$body.AppendLine('<w:p><w:pPr><w:pStyle w:val="Heading4"/></w:pPr>' + (ConvertTo-Runs $t) + '</w:p>')
    }
    elseif ($trim -match '^-{3,}$' -or $trim -match '^\*{3,}$') {
        [void]$body.AppendLine('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr></w:pPr></w:p>')
    }
    elseif ($trim -match '^[-*]\s+') {
        $t = $trim -replace '^[-*]\s+', ''
        [void]$body.AppendLine('<w:p><w:pPr><w:ind w:left="360"/></w:pPr><w:r><w:t xml:space="preserve">• </w:t></w:r>' + (ConvertTo-Runs $t) + '</w:p>')
    }
    elseif ($trim -match '^\d+[\.、]\s+') {
        $t = $trim -replace '^\d+[\.、]\s+', ''
        [void]$body.AppendLine('<w:p><w:pPr><w:ind w:left="360"/></w:pPr>' + (ConvertTo-Runs $t) + '</w:p>')
    }
    elseif ($trim -match '^> ') {
        $t = $trim -replace '^> ', ''
        [void]$body.AppendLine('<w:p><w:pPr><w:ind w:left="360"/><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/></w:pPr>' + (ConvertTo-Runs $t) + '</w:p>')
    }
    else {
        [void]$body.AppendLine('<w:p>' + (ConvertTo-Runs $trim) + '</w:p>')
    }
    $i++
}
Flush-Table

if ($Landscape) {
    $sectPr = '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr>'
} else {
    $sectPr = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/></w:sectPr>'
}

$docXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
'<w:body>' + $body.ToString() + $sectPr + '</w:body></w:document>'

$stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
'<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="微软雅黑"/><w:sz w:val="21"/></w:rPr></w:style>' +
'<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="7030A0"/></w:rPr></w:style>' +
'<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:spacing w:before="200" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="2E74B5"/></w:rPr></w:style>' +
'<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:pPr><w:spacing w:before="160" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="23"/><w:color w:val="404040"/></w:rPr></w:style>' +
'<w:style w:type="paragraph" w:styleId="Heading4"><w:name w:val="heading 4"/><w:pPr><w:spacing w:before="120" w:after="60"/><w:outlineLvl w:val="3"/></w:pPr><w:rPr><w:b/><w:sz w:val="21"/></w:rPr></w:style>' +
'</w:styles>'

$contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
'<Default Extension="xml" ContentType="application/xml"/>' +
'<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
'<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
'</Types>'

$rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
'</Relationships>'

$docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
'</Relationships>'

if (Test-Path $OutPath) { Remove-Item $OutPath -Force }
$zip = [System.IO.Compression.ZipFile]::Open($OutPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    function Add-EntryToZip($zip, $name, $content) {
        $entry = $zip.CreateEntry($name)
        $stream = $entry.Open()
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Close()
    }
    Add-EntryToZip $zip '[Content_Types].xml' $contentTypes
    Add-EntryToZip $zip '_rels/.rels' $rels
    Add-EntryToZip $zip 'word/document.xml' $docXml
    Add-EntryToZip $zip 'word/styles.xml' $stylesXml
    Add-EntryToZip $zip 'word/_rels/document.xml.rels' $docRels
} finally {
    $zip.Dispose()
}

Write-Output ("OK: {0} ({1} bytes)" -f $OutPath, (Get-Item $OutPath).Length)