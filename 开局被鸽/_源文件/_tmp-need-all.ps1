$ErrorActionPreference='Stop'
function Get-CN([string]$t){
  $c=$t -replace '[，。！？、；：""「」（）《》…—·/%,.!?;:\s]',''
  $latin=0;$letters=0
  foreach($m in [regex]::Matches($c,'[A-Za-z]+')){
    $w=$m.Value;$letters+=$w.Length
    $syl=([regex]::Matches($w.ToLower(),'[aeiouyáéíóúüàèìòùâêîôûäëïöü]+')).Count
    if($syl -lt 1){$syl=1}
    $latin+=$syl
  }
  return (($c.Length-$letters)+$latin)
}
function Get-EN([string]$t){
  $c=$t.Replace('/',' ').Replace('-',' ').Replace([char]0x2014,' ')
  $c=[regex]::Replace($c,"[^A-Za-z' ]",' ')
  return (($c -split '\s+' | Where-Object { $_.Trim().Length -gt 0 }).Count)
}
# 每行台词按分句切成候选片段（中文按，。！？；切，英文按句子/强调暂停切）
# 返回列表，然后贪心合并：保证每个镜头=max中英<=4s
$src = Get-Content 'E:\Deepseek\开局被鸽\_源文件\_src-第3集.json' -Raw -Encoding UTF8 | ConvertFrom-Json
$overall=@()
foreach($r in $src){
  $isOS = ($r.speaker -match 'OS|VO')
  Write-Host ("=== 行{0} {1} OS={2} ===" -f $r.line, $r.speaker, $isOS)
  Write-Host ("  CN: {0}" -f $r.cn)
  Write-Host ("  EN: {0}" -f $r.en)
  $needCN=[Math]::Ceiling((Get-CN $r.cn)/$(if($isOS){5}else{4}))
  $needEN=[Math]::Ceiling((Get-EN $r.en)/3.5)
  Write-Host ("  需要秒数: CN={0} EN={1} need={2}" -f $needCN,$needEN,[Math]::Max($needCN,$needEN))
}
