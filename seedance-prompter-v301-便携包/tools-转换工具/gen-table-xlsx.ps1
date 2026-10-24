# gen-table-xlsx.ps1 — 通用表格 → .xlsx 生成器（多工作表 / 样式化排版）
# 用法: powershell -NoProfile -ExecutionPolicy Bypass -File gen-table-xlsx.ps1 -JsonPath xxx.json -OutPath xxx.xlsx
#
# JSON 结构:
# {
#   "style": {                       # 可选：整体排版风格，缺省 blue 主题
#     "theme":           "blue",    # 主题：blue(商务蓝) / green(墨绿) / graphite(高级灰) / warm(暖棕) / red(正红) / print(黑白打印)
#     "fontFamily":      "微软雅黑",  # 字体（中文优先）
#     "headerFill":      "2F5597",   # 表头底色（深蓝）
#     "headerFontColor": "FFFFFF",   # 表头字色（白）
#     "bandFill":        "EEF3FA",   # 隔行浅底色
#     "bodyFontColor":   "262626",   # 正文字色
#     "innerBorder":     "BFBFBF",   # 内线色（细）
#     "outerBorder":     "2F5597",   # 外框色（粗）
#     "zebra":           true,       # 隔行底色开关
#     "freezeHeader":    true        # 冻结表头开关
#   },
#   "sheets": [
#     { "name": "工作表名", "widths": [列宽...], "rows": [ ["表头1","表头2"], ["数据1","数据2"] ] }
#   ]
# }
# 第一行自动作为表头（加粗/白字/彩色底/居中）；外框 medium、内线 thin；正文自动换行并按内容估算行高。

param(
    [Parameter(Mandatory=$true)][string]$JsonPath,
    [Parameter(Mandatory=$true)][string]$OutPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function ConvertTo-XmlText([string]$s) { return [System.Net.WebUtility]::HtmlEncode($s) }

# 列号 0 -> A, 25 -> Z, 26 -> AA ...（不再限制 26 列）
function Get-ColLetters([int]$index) {
    $n = $index + 1
    $s = ''
    while ($n -gt 0) {
        $rem = ($n - 1) % 26
        $s = [string][char](65 + $rem) + $s
        $n = [int][math]::Floor(($n - 1) / 26)
    }
    return $s
}

# 展示宽度：中日韩全角字符算 2，其余算 1（用于估算自动行高）
function Get-DispWidth([string]$s) {
    $w = 0
    foreach ($ch in $s.ToCharArray()) {
        if ([int][char]$ch -gt 0x2E80) { $w += 2 } else { $w += 1 }
    }
    return $w
}

# 颜色规范化：接受 "#2F5597" / "2F5597"；非法值回退默认
function Normalize-Color([string]$c, [string]$fallback) {
    if (-not $c) { return $fallback }
    $v = $c.Trim().TrimStart('#').ToUpper()
    if ($v -match '^[0-9A-F]{6}$') { return $v }
    return $fallback
}

function Get-StyleValue($obj, [string]$name, $default) {
    if ($null -eq $obj) { return $default }
    $p = $obj.PSObject.Properties[$name]
    if ($null -eq $p -or $null -eq $p.Value) { return $default }
    if ($p.Value -is [string] -and $p.Value -eq '') { return $default }
    return $p.Value
}

# ---------- 读取入参 + 解析风格 ----------
$json = [System.IO.File]::ReadAllText($JsonPath, [System.Text.Encoding]::UTF8)
$data = $json | ConvertFrom-Json
$sheets = @($data.sheets)
if ($sheets.Count -eq 0) { throw "JSON 里没有 sheets" }
$st = $data.style

# 主题预设：style.theme 选一套，再用显式颜色键覆盖其中任意一项
$themes = @{
    'blue'     = @{ headerFill = '2F5597'; headerFontColor = 'FFFFFF'; bandFill = 'EEF3FA'; bodyFontColor = '262626'; innerBorder = 'BFBFBF'; outerBorder = '2F5597'; zebra = $true }
    'green'    = @{ headerFill = '276749'; headerFontColor = 'FFFFFF'; bandFill = 'EAF5EE'; bodyFontColor = '23302A'; innerBorder = 'C3D6CA'; outerBorder = '276749'; zebra = $true }
    'graphite' = @{ headerFill = '3B3F46'; headerFontColor = 'FFFFFF'; bandFill = 'F2F3F5'; bodyFontColor = '26282B'; innerBorder = 'C9CCD1'; outerBorder = '3B3F46'; zebra = $true }
    'warm'     = @{ headerFill = '9C6B3F'; headerFontColor = 'FFFFFF'; bandFill = 'FBF3E8'; bodyFontColor = '33281C'; innerBorder = 'DCC9AE'; outerBorder = '9C6B3F'; zebra = $true }
    'print'    = @{ headerFill = 'E8E8E8'; headerFontColor = '000000'; bandFill = 'FFFFFF'; bodyFontColor = '000000'; innerBorder = '808080'; outerBorder = '000000'; zebra = $false }
    'red'      = @{ headerFill = 'A61B29'; headerFontColor = 'FFFFFF'; bandFill = 'FBEDEE'; bodyFontColor = '3A2226'; innerBorder = 'E5C5C8'; outerBorder = 'A61B29'; zebra = $true }
}
$themeName = [string](Get-StyleValue $st 'theme' 'blue')
$theme = $themes[$themeName]
if ($null -eq $theme) { $theme = $themes['blue'] }

$fFont   = [string](Get-StyleValue $st 'fontFamily'      '微软雅黑')
$fHdr    = Normalize-Color ([string](Get-StyleValue $st 'headerFill'      $theme.headerFill))  $theme.headerFill
$fHdrTxt = Normalize-Color ([string](Get-StyleValue $st 'headerFontColor' $theme.headerFontColor)) $theme.headerFontColor
$fBand   = Normalize-Color ([string](Get-StyleValue $st 'bandFill'        $theme.bandFill))    $theme.bandFill
$fBody   = Normalize-Color ([string](Get-StyleValue $st 'bodyFontColor'   $theme.bodyFontColor)) $theme.bodyFontColor
$bInner  = Normalize-Color ([string](Get-StyleValue $st 'innerBorder'     $theme.innerBorder)) $theme.innerBorder
$bOuter  = Normalize-Color ([string](Get-StyleValue $st 'outerBorder'     $theme.outerBorder)) $theme.outerBorder
$zebra   = [bool](Get-StyleValue $st 'zebra'        $theme.zebra)
$freeze  = [bool](Get-StyleValue $st 'freezeHeader' $true)

# ---------- styles.xml ----------
$fontName = ConvertTo-XmlText $fFont

# 字体：0 = 正文，1 = 表头
$fontsXml = '<fonts count="2">' +
'<font><sz val="10.5"/><color rgb="FF' + $fBody + '"/><name val="' + $fontName + '"/><charset val="134"/></font>' +
'<font><b/><sz val="11"/><color rgb="FF' + $fHdrTxt + '"/><name val="' + $fontName + '"/><charset val="134"/></font>' +
'</fonts>'

# 填充：0 = 无，1 = 表头，2 = 隔行
# 填充槽位必须按 Excel 约定：0 = 无填充，1 = gray125（占位），真实填充从 2 开始。
# 若把自定义填充放在 1 号位，WPS 会按约定把它当成 gray125 图案 -> 表头渲染成白/灰纹，白字直接看不见。
$fillsXml = '<fills count="4">' +
'<fill><patternFill patternType="none"/></fill>' +
'<fill><patternFill patternType="gray125"/></fill>' +
'<fill><patternFill patternType="solid"><fgColor rgb="FF' + $fHdr + '"/></patternFill></fill>' +
'<fill><patternFill patternType="solid"><fgColor rgb="FF' + $fBand + '"/></patternFill></fill>' +
'</fills>'

# 边框：0 = 无；1..16 = 边框组合
#   bit1=上边 bit2=下边 bit4=左边 bit8=右边（表边缘那一边用 medium 外框色，其余边用 thin 内线色）
$bordersXml = '<borders count="17"><border><left/><right/><top/><bottom/><diagonal/></border>'
for ($s = 0; $s -lt 16; $s++) {
    $b = New-Object System.Text.StringBuilder
    foreach ($side in @('left', 'right', 'top', 'bottom')) {
        $bit = 1
        switch ($side) { 'top' { $bit = 1 } 'bottom' { $bit = 2 } 'left' { $bit = 4 } 'right' { $bit = 8 } }
        if ($s -band $bit) { $w = 'medium'; $col = $bOuter } else { $w = 'thin'; $col = $bInner }
        [void]$b.Append('<' + $side + ' style="' + $w + '"><color rgb="FF' + $col + '"/></' + $side + '>')
    }
    [void]$b.Append('<diagonal/>')
    $bordersXml += '<border>' + $b.ToString() + '</border>'
}
$bordersXml += '</borders>'

# 单元格样式：索引 0 = 默认；之后 1 + 边框组合*3 + 变体（0 表头 / 1 正文奇数行 / 2 正文偶数行）
$cellXfsXml = '<cellXfs count="49"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
for ($s = 0; $s -lt 16; $s++) {
    $bid = [string]($s + 1)
    $cellXfsXml += '<xf numFmtId="0" fontId="1" fillId="2" borderId="' + $bid + '" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
    $cellXfsXml += '<xf numFmtId="0" fontId="0" fillId="0" borderId="' + $bid + '" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>'
    $cellXfsXml += '<xf numFmtId="0" fontId="0" fillId="3" borderId="' + $bid + '" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>'
}
$cellXfsXml += '</cellXfs>'

$styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
$fontsXml +
$fillsXml +
$bordersXml +
'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
$cellXfsXml +
'<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
'</styleSheet>'

# ---------- 工作表 XML ----------
function New-Cell([string]$ref, [string]$text, [int]$style) {
    return '<c r="' + $ref + '" t="inlineStr" s="' + $style + '"><is><t xml:space="preserve">' + (ConvertTo-XmlText $text) + '</t></is></c>'
}

function New-SheetData($rows, $widths, [bool]$useZebra) {
    $sb = New-Object System.Text.StringBuilder
    $rowCount = @($rows).Count
    if ($rowCount -eq 0) { return '' }
    $lastRow = $rowCount - 1
    for ($r = 0; $r -lt $rowCount; $r++) {
        $row = @($rows[$r])
        $colCount = $row.Count
        if ($colCount -eq 0) { continue }
        $lastCol = $colCount - 1

        # 按列宽估算需要几行才能放下，撑开行高（避免长提示词被裁切）
        $lines = 1
        for ($c = 0; $c -lt $colCount; $c++) {
            $txt = [string]$row[$c]
            $w = 8.43
            if ($widths -and $c -lt @($widths).Count) { $w = [double]$widths[$c] }
            if ($w -lt 4) { $w = 4 }
            $need = 0
            foreach ($part in ($txt -split "`n")) {
                # 留 10% 余量：中文字体比宽度基准字体略宽，宁可多一行也不裁字
                $n = [int][math]::Ceiling((Get-DispWidth $part) / ($w * 0.9))
                if ($n -lt 1) { $n = 1 }
                $need += $n
            }
            if ($need -gt $lines) { $lines = $need }
        }
        $ht = 15 * $lines
        if ($r -eq 0 -and $ht -lt 24) { $ht = 24 }
        if ($ht -gt 240) { $ht = 240 }

        [void]$sb.Append('<row r="' + ($r + 1) + '" ht="' + $ht + '" customHeight="1">')
        for ($c = 0; $c -lt $colCount; $c++) {
            $edge = 0
            if ($r -eq 0) { $edge = $edge -bor 1 }
            if ($r -eq $lastRow) { $edge = $edge -bor 2 }
            if ($c -eq 0) { $edge = $edge -bor 4 }
            if ($c -eq $lastCol) { $edge = $edge -bor 8 }
            $variant = 1
            if ($r -eq 0) { $variant = 0 }
            elseif ($useZebra -and (($r % 2) -eq 0)) { $variant = 2 }
            $style = 1 + $edge * 3 + $variant
            [void]$sb.Append((New-Cell ((Get-ColLetters $c) + ($r + 1)) ([string]$row[$c]) $style))
        }
        [void]$sb.Append('</row>')
    }
    return $sb.ToString()
}

function New-Worksheet($rows, $widths, [bool]$useZebra, [bool]$useFreeze) {
    $cols = ''
    if ($widths) {
        $sb = New-Object System.Text.StringBuilder
        $wi = 0
        foreach ($wv in @($widths)) {
            [void]$sb.Append('<col min="' + ($wi + 1) + '" max="' + ($wi + 1) + '" width="' + $wv + '" customWidth="1"/>')
            $wi++
        }
        $cols = $sb.ToString()
    }

    $maxCols = 0
    $maxRows = @($rows).Count
    foreach ($r in @($rows)) { $rc = @($r).Count; if ($rc -gt $maxCols) { $maxCols = $rc } }
    $dimRef = 'A1'
    if ($maxRows -gt 0 -and $maxCols -gt 0) { $dimRef = 'A1:' + (Get-ColLetters ($maxCols - 1)) + $maxRows }

    $views = '<sheetViews><sheetView workbookViewId="0">'
    if ($useFreeze -and $maxRows -gt 1) {
        $views += '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
                  '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>'
    }
    $views += '</sheetView></sheetViews>'

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<dimension ref="' + $dimRef + '"/>' +
    $views +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    '<cols>' + $cols + '</cols>' +
    '<sheetData>' + (New-SheetData $rows $widths $useZebra) + '</sheetData>' +
    '</worksheet>'
}

# ---------- 打包 ----------
$ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
'<Default Extension="xml" ContentType="application/xml"/>' +
'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
for ($i = 0; $i -lt $sheets.Count; $i++) {
    $ct += '<Override PartName="/xl/worksheets/sheet' + ($i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
}
$ct += '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
'</Types>'

$rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
'</Relationships>'

$wbSheets = ''
$wbRels = ''
for ($i = 0; $i -lt $sheets.Count; $i++) {
    $wbSheets += '<sheet name="' + ([System.Net.WebUtility]::HtmlEncode([string]$sheets[$i].name)) + '" sheetId="' + ($i + 1) + '" r:id="rId' + ($i + 1) + '"/>'
    $wbRels += '<Relationship Id="rId' + ($i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + ($i + 1) + '.xml"/>'
}
$wbRels += '<Relationship Id="rId' + ($sheets.Count + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'

$workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
'<sheets>' + $wbSheets + '</sheets>' +
'</workbook>'

$workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
$wbRels +
'</Relationships>'

if (Test-Path $OutPath) { Remove-Item $OutPath -Force }
$zip = [System.IO.Compression.ZipFile]::Open($OutPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    function Add-Entry($zip, $name, $content) {
        $entry = $zip.CreateEntry($name)
        $stream = $entry.Open()
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Close()
    }
    Add-Entry $zip '[Content_Types].xml' $ct
    Add-Entry $zip '_rels/.rels' $rels
    Add-Entry $zip 'xl/workbook.xml' $workbook
    Add-Entry $zip 'xl/_rels/workbook.xml.rels' $workbookRels
    Add-Entry $zip 'xl/styles.xml' $styles
    for ($i = 0; $i -lt $sheets.Count; $i++) {
        # 前置逗号：避免管道把内层数组再展开一层（原 bug：二维表被压成一维、全挤在 A 列）
        $rows = @($sheets[$i].rows | ForEach-Object { ,@($_) })
        $widths = $null
        if ($null -ne $sheets[$i].widths) { $widths = @($sheets[$i].widths) }
        Add-Entry $zip ('xl/worksheets/sheet' + ($i + 1) + '.xml') (New-Worksheet $rows $widths $zebra $freeze)
    }
} finally {
    $zip.Dispose()
}

Write-Output ("OK: {0} ({1} bytes, {2} sheets)" -f $OutPath, (Get-Item $OutPath).Length, $sheets.Count)