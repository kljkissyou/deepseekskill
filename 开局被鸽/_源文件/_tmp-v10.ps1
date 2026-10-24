$ErrorActionPreference='Stop'
$plan = @(
 @(1,'1-1','187a',3), @(1,'1-2','187b',2), @(1,'1-3','none',4),
 @(2,'2-1','190a',2), @(2,'2-2','190b',2), @(2,'2-3','none',2), @(2,'2-4','195',2),
 @(2,'2-5','198a',3), @(2,'2-6','198b',3),
 @(3,'3-1','201a',2), @(3,'3-2','201b',3), @(3,'3-3','201c',3), @(3,'3-4','201d',2),
 @(3,'3-5','none',2),
 @(4,'4-1','205a',4), @(4,'4-2','205b',3), @(4,'4-3','208',3), @(4,'4-4','212a',4),
 @(5,'5-1','212b',4), @(5,'5-2','215',4), @(5,'5-3','218',3), @(5,'5-4','221',2),
 @(6,'6-1','224',4), @(6,'6-2','227a',4), @(6,'6-3','227b',3), @(6,'6-4','230a',4),
 @(7,'7-1','230b',4), @(7,'7-2','230c',4), @(7,'7-3','233a',4), @(7,'7-4','233b',3),
 @(8,'8-1','236',4), @(8,'8-2','239a',4), @(8,'8-3','239b',3), @(8,'8-4','none',3)
)
$bad=0;$tot=0
foreach($seg in 1..8){
  $rs=@($plan|Where-Object{$_[0] -eq $seg})
  $s=($rs|ForEach-Object{$_[3]}|Measure-Object -Sum).Sum
  $tot+=$s
  $exp=1
  foreach($r in $rs){ if($r[1] -ne "$seg-$exp"){ Write-Host "编号断裂 $($r[1])"; $bad++ }; $exp++ }
  if($s -gt 15){ Write-Host "seg${seg} OVER ${s}s"; $bad++ }
  $labels = ($rs | ForEach-Object { $_[2] }) -join ','
  Write-Host ("seg{0}: {1}s [{2}]" -f $seg,$s,$labels)
}
Write-Host ("TOTAL={0} shots={1} problems={2}" -f $tot,$plan.Count,$bad)
$w=($plan|Where-Object{$_[2] -ne 'none'}).Count
Write-Host ("dialog-shots={0} no-dialog={1} purple={2}" -f $w,($plan.Count-$w),($w*3))