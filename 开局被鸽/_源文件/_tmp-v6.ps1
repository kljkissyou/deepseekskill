$ErrorActionPreference='Stop'
# FINAL shot list in order: label | dur | need
$shots = @(
 @('187a',3,3), @('187b',2,2), @('-',4,0),
 @('190a',2,2), @('190b',2,2), @('-',2,0), @('195',2,2), @('198a',3,3), @('198b',3,3),
 @('201a',2,2), @('201b',3,3), @('201c',2,4), @('-',2,0), @('205a',4,4),
 @('205b',3,3), @('208',3,3), @('212a',4,4), @('212b',4,4),
 @('215',4,4), @('218',3,3), @('221',2,2), @('224',4,4),
 @('227a',4,4), @('227b',3,3), @('230a',4,4), @('230b',4,4),
 @('230c',4,4), @('233a',4,4), @('233b',3,3), @('236',4,4),
 @('239a',4,4), @('239b',3,3), @('-',3,0), @('-',3,0)
)
# 手工段划分（段 -> 镜头数）
$segSizes = @(3,6,5,4,4,4,4,4)   # 合计 34
$n = $shots.Count
$sum = ($segSizes | Measure-Object -Sum).Sum
Write-Host "shots=$n segSizeSum=$sum"
$i=0; $tot=0; $bad=0; $sNo=1
foreach($sz in $segSizes){
  $s=0; $labs=@()
  for($k=0;$k -lt $sz;$k++){
    $sh=$shots[$i]
    $s+=$sh[1]; $labs+="$sNo-$($k+1)=$($sh[0])($($sh[1])s)"
    if($sh[1] -gt 4){ Write-Host "OVER4 $($sh[0])"; $bad++ }
    if($sh[2] -gt 0 -and $sh[1] -lt $sh[2]){ Write-Host "TOOSHORT $($sh[0]) dur=$($sh[1]) need=$($sh[2])"; $bad++ }
    $i++
  }
  $flag = if($s -gt 15){' ** OVER15 **'; $bad++}else{''}
  Write-Host ("seg{0}: {1}s | {2}" -f $sNo,$s,($labs -join ' '))
  Write-Host ("        {0}shots{1}" -f $sz,$flag)
  $tot+=$s; $sNo++
}
Write-Host ("TOTAL {0}s | {1} segments | problems={2}" -f $tot,$segSizes.Count,$bad)
