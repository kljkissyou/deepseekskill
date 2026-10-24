$ErrorActionPreference='Stop'
$durs = @(3,2,4, 2,2,2,2,3, 3,2,3,2,2,4, 3,3,4,4, 4,3,2,4, 4,3,4,4, 4,4,3,4, 4,3,3,3)
$label= @('187a','187b','-','190a','190b','-','195','198a','198b','201a','201b','201c','-','205a','205b','208','212a','212b','215','218','221','224','227a','227b','230a','230b','230c','233a','233b','236','239a','239b','-','-')
$n=$durs.Count
$pref=New-Object 'int[]' ($n+1)
for($i=0;$i -lt $n;$i++){ $pref[$i+1]=$pref[$i]+$durs[$i] }
$cuts=@(0,3,9,14,18,22,26,27,31,34)
Write-Host "=== 9 segments ==="
$tot=0;$idx=1;$shotNo=0
for($c=0;$c -lt $cuts.Count-1;$c++){
  $a=$cuts[$c]; $b=$cuts[$c+1]
  $s=$pref[$b]-$pref[$a]
  $labs=@(); for($i=$a;$i -lt $b;$i++){ $shotNo++; $labs+="$idx-$($i-$a+1)=$($label[$i])($($durs[$i])s)" }
  Write-Host ("seg{0}: {1}s | {2}" -f $idx,$s,($labs -join ' '))
  $tot+=$s; $idx++
}
Write-Host ("TOTAL {0}s | shots={1} | segments={2}" -f $tot,$n,($cuts.Count-1))
