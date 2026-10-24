# md2docx.ps1 — 轻量 Markdown → .docx (Open XML) 转换器
# 用法: powershell -NoProfile -ExecutionPolicy Bypass -File md2docx.ps1 -MdPath xxx.md -OutPath xxx.docx [-Landscape]
# 支持: # / ## / ### 标题, **加粗**, *斜体*, | 表格 |, - 列表, 数字列表, --- 分隔线, > 引用
# 由 Seedance 提示词导演工作流使用（Word COM 不可用时替代 D:\deepseek\.tools\md2docx\md2docx.ps1）

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

# --- XML 转义 + 行内标记（**bold** / *italic*）转 run 序列 ---
function ConvertTo-Runs([string]$text) {
    if ($null -eq $text) { return '' }
    $xml = ConvertTo-HtmlEncoded $text
    # **bold**
    $patternBold = '\*\*(.+?)\*\*'
    $runs = New-Object System.Text.StringBuilder
    $pos = 0
    foreach ($m in [regex]::Matches($xml, $patternBold)) {
        if ($m.Index -gt $pos) {
            [void]$runs.Append('<w:r><w:t xml:space="preserve">' + $xml.Substring($pos, $m.Index - $pos) + '</w:t></w:r>')
        }
        [void]$runs.Append('<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">' + $m.Groups[1].Value + '</w:t></w:r>')
        $pos = $m.Index + $m.Length
    }
    if ($pos -lt $xml.Length) {
        [void]$runs.Append('<w:r><w:t xml:space="preserve">' + $xml.Substring($pos) + '</w:t></w:r>')
    }
    if ($runs.Length -eq 0) {
        [void]$runs.Append('<w:r><w:t xml:space="preserve">' + $xml + '</w:t></w:r>')
    }
    return $runs.ToString()
}

# --- 构建单元格 ---
function New-Cell([string]$content, [bool]$header) {
    $runs = ConvertTo-Runs $content
    if ($header) {
        return '<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr>' + $runs + '</w:p></w:tc>'
    }
    return '<w:tc><w:p>' + $runs + '</w:p></w:tc>'
}

# --- 解析表格行: | a | b | c | ---
function Get-CellsFromLine([string]$line) {
    $l = $line.Trim()
    if (-not $l.StartsWith('|')) { return @() }
    $l = $l.TrimStart('|').TrimEnd('|')
    return @($l -split '\|' | ForEach-Object { $_.Trim() })
}

# --- 主流程 ---
$lines = Get-Content -Path $MdPath -Encoding UTF8
$body = New-Object System.Text.StringBuilder
$i = 0
$inTable = $false
$tableRows = New-Object System.Collections.ArrayList

function Flush-Table {
    if ($script:inTable -and $script:tableRows.Count -gt 0) {
        # 第一行为表头，第二行若全为 --- 则是分隔行，跳过
        $headerRow = $script:tableRows[0]
        $dataStart = 1
        if ($script:tableRows.Count -gt 1) {
            $sep = Get-CellsFromLine $script:tableRows[1]
            $isSep = ($sep.Count -gt 0) -and (($sep | Where-Object { $_ -notmatch '^-{2,}$' }).Count -eq 0)
            if ($isSep) { $dataStart = 2 }
        }
        $tbl = New-Object System.Text.StringBuilder
        [void]$tbl.Append('<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders></w:tblPr>')
        # 表头
        $hCells = Get-CellsFromLine $headerRow
        [void]$tbl.Append('<w:tr>')
        foreach ($c in $hCells) { [void]$tbl.Append((New-Cell $c $true)) }
        [void]$tbl.Append('</w:tr>')
        # 数据行
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
        if (-not $inTable) {
            Flush-Table
            $inTable = $true
        }
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
        [void]$body.AppendLine('<w:p><w:pPr><w:ind w:left="360"/></w:pPr><w:r><w:t xml:space="preserve">• </w:t></w:r>' + (ConvertTo-Runs $t).Replace('<w:r>', '<w:r><w:rPr><w:i/></w:rPr>') + '</w:p>')
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

# --- sectPr（默认纵向 A4；-Landscape 时横向 A4）---
$sectPr = $null
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
'<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="1F4E79"/></w:rPr></w:style>' +
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

# --- 写 zip ---
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