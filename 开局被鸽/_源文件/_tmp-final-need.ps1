$ErrorActionPreference='Stop'
function Get-CN([string]$t){
  $punct=@('，','。','！','？','、','；','：','“','”','「','」','（','）','《','》','…','—','·','/','%','．',',','.','!','?',';',':',' ','【','】','｜')
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
# 计划镜头： shot | CN | EN | isOS | dur
$shots = @(
 @('1-1','Damián，这是你的工位，','Damián, this is your workstation.',0,2),
 @('1-2','（递工牌）这是你的工牌。','(Handing over the work badge) This is your work badge.',0,3),
 @('1-3','','',0,3),
 @('2-1','组长？','Team lead?',0,2),
 @('2-2','我应聘的不是普通职员吗？',"Didn't I apply for an ordinary staff position?",0,3),
 @('2-3','','',0,2),
 @('2-4','Damián，加油吧！',"Good luck, Damián! You've got this!",0,2),
 @('3-1','（满意地看着工牌）组长就组长，','(looking at the work ID with satisfaction) Team lead is great.',1,4),
 @('3-2','工资肯定比普通员工的多。','The salary must be higher than that of ordinary employees.',1,3),
 @('3-3','（低沉，带回声）命运节点已记录。','(deep, echoing) Fate-node recorded.',1,3),
 @('3-4','节点：信息安全部。','Node: Cybersecurity Department.',1,2),
 @('4-1','命运馈赠——顶级黑客之能，此后数字世界再无屏障可阻你脚步。',"Fate's offering—top-tier hacking mastery; from this day forth, no barrier in the digital world shall stand in your way.",1,4),
 @('4-2','','',0,2),
 @('5-1','（喜）这可是个好东西！','(delighted) This is awesome!',0,2),
 @('5-2','有了黑客能力，','With hacking skills like these,',0,2),
 @('5-3','我岂不是能在部门里横着走了！',"I'll be unstoppable in the department!",0,4),
 @('5-4','','',0,2),
 @('6-1','（喘粗气）完蛋了，迟到了。',"(gasping) Damn, I'm late!",0,3),
 @('6-2','（娇弱）组长你好，我是您的组员Eloísa。','(softly) Hello, team lead! I''m Eloísa, one of your team members.',0,4),
 @('6-3','迟到了真是对不起，','I''m really sorry for arriving late,',0,2),
 @('6-4','我昨天刚结婚，睡得太晚了。','I just got married yesterday and overslept.',0,3),
 @('7-1','（冷声）结婚？你可真会撒谎啊，Eloísa！','(coldly) Married? You do enjoy lying, Eloísa.',0,4),
 @('7-2','（震惊）他怎么知道？','(Shocked) How did he know?',1,3),
 @('7-3','不对，这个声音是……','No, this voice is...',1,2),
 @('7-4','我说得对吗？Eloísa!','Or am I wrong? Eloísa',0,3),
 @('8-1','（尖叫）啊！',"(Screams) Ah!",0,2),
 @('8-2','你，你怎么在这？','You—how are you here?',0,2),
 @('8-3','（提醒）Eloísa，这是我们的新组长啊。','(Reminds) Eloísa, this is our new team lead.',0,3),
 @('8-4','难道，（来回打量）你们认识？','Could it be that—(glances around)—you knew each other?',0,3),
 @('9-1','Eloísa，是我的前女友。','Eloísa is my ex-girlfriend.',0,3),
 @('9-2','昨天该结婚的时候却逃婚。','She walked out on our wedding yesterday.',0,3),
 @('9-3','按照公司规定，迟到并虚报原因，',"But rules are rules. Being late and lying about the reason",0,4),
 @('9-4','记严重警告，扣除当日绩效。',"earns you a serious warning and costs you today's performance bonus.",0,4),
 @('10-1','谁允许你来这上班了？','Who said you could work here?',0,3),
 @('10-2','我不就是逃婚了吗？','So I walked out on our wedding.',0,2),
 @('10-3','你故意让我难堪？','Is this your way of getting back at me?',0,3),
 @('11-1','这是公司，不是你大喊大叫的地方！','We are at work. Behave yourself.',0,4),
 @('11-2','（怒吼）Damián！',"(Roaring) Damián!",0,2),
 @('11-3','除非你现在离职，否则我就不跟你结婚了！',"Unless you resign right now, I won't marry you!",0,4),
 @('11-4','你这个渣男！',"You're a total scumbag!",0,2),
 @('11-5','','',0,3)
)
$bad=0;$tot=0
foreach($s in $shots){
  $isOS=[int]$s[3]; $dur=[int]$s[4]
  $need=0
  if($s[1] -ne ''){
    $cn=(Get-CN $s[1]); $en=(Get-EN $s[2])
    $sc=[Math]::Ceiling($cn/$(if($isOS -eq 1){5}else{4}))
    $se=[Math]::Ceiling($en/3.5)
    $need=[Math]::Max($sc,$se)
  }
  $flag=''
  if($need -gt $dur){ $flag=' ** INSUFFICIENT **'; $bad++ }
  if($dur -gt 4){ $flag+=' ** OVER4 **'; $bad++ }
  if($s[1] -ne ''){
    Write-Host ("{0}: dur={1} cn={2} en={3} need={4}{5}" -f $s[0],$dur,(Get-CN $s[1]),(Get-EN $s[2]),$need,$flag)
  } else {
    Write-Host ("{0}: dur={1} (no dialogue){2}" -f $s[0],$dur,$flag)
  }
  $tot+=$dur
}
Write-Host ("TOTAL={0}s shots={1} problems={2}" -f $tot,$shots.Count,$bad)
