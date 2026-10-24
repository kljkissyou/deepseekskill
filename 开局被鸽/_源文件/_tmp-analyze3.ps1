$ErrorActionPreference='Stop'
function Get-CN([string]$t){
  $punct=@('，','。','！','？','、','；','：','“','”','「','」','（','）','《','》','…','—','·','/','%','．',',','.','!','?',';',':',' ')
  $c=$t; foreach($p in $punct){ $c=$c.Replace($p,'') }
  $latin=0;$letters=0
  foreach($m in [regex]::Matches($c,'[A-Za-zÀ-ÿ]+')){
    $w=$m.Value;$letters+=$w.Length
    $s=([regex]::Matches($w.ToLower(),'[aeiouyáéíóúüàèìòùâêîôûäëïöü]+')).Count
    if($s -lt 1){$s=1}
    $latin+=$s
  }
  return (($c.Length-$letters)+$latin)
}
function Get-EN([string]$t){
  $c=$t.Replace('/',' ').Replace('-',' ').Replace([char]0x2014,' ')
  $c=[regex]::Replace($c,"[^A-Za-zÀ-ÿ' ]",' ')
  return (($c -split '\s+' | Where-Object { $_.Trim().Length -gt 0 }).Count)
}
$src = Get-Content 'E:\Deepseek\开局被鸽\_源文件\_src-第3集.json' -Raw -Encoding UTF8 | ConvertFrom-Json
foreach($r in $src){
  $isOS = ($r.speaker -match 'OS|VO')
  $cnw = (Get-CN $r.cn); $enw=(Get-EN $r.en)
  $secCN = [Math]::Ceiling($cnw/$(if($isOS){5}else{4}))
  $secEN = [Math]::Ceiling($enw/3.5)
  $need = [Math]::Max($secCN,$secEN)
  Write-Host ("行{0,-4} {1,-12} cn={2,-3} en={3,-3} cnSec={4} enSec={5} need={6} OS={7}" -f $r.line,$r.speaker,$cnw,$enw,$secCN,$secEN,$need,$isOS)
}
