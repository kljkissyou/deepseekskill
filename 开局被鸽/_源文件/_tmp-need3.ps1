$ErrorActionPreference='Stop'
function Get-CN([string]$t){
  $punct=@([char]0xFF0C,[char]0x3002,[char]0xFF01,[char]0xFF1F,[char]0x3001,[char]0xFF1B,[char]0xFF1A,[char]0x201C,[char]0x201D,[char]0x300C,[char]0x300D,[char]0xFF08,[char]0xFF09,[char]0x300A,[char]0x300B,[char]0x2026,[char]0x2014,[char]0x00B7,'/','%','.',',','!','?',';',':',' ')
  $c=$t; foreach($p in $punct){ $c=$c.Replace($p,'') }
  $latin=0;$letters=0
  foreach($m in [regex]::Matches($c,'[A-Za-z]+')){ $w=$m.Value; $letters+=$w.Length; $latin+=1 }
  return (($c.Length-$letters)+$latin)
}
function Get-EN([string]$t){
  $c=$t.Replace('/',' ').Replace('-',' ')
  $c=[regex]::Replace($c,"[^A-Za-z' ]",' ')
  return (($c -split '\s+' | Where-Object { $_.Trim().Length -gt 0 }).Count)
}
# label | chinese | english | isOS
$items = @(
 @('1-1','Damián，这是你的工位，','Damián, this is your workstation.',0),
 @('1-2','（递工牌）这是你的工牌。','(Handing over the work badge) This is your work badge.',0),
 @('2-1','组长？','Team lead?',0),
 @('2-2','我应聘的不是普通职员吗？',"Didn't I apply for an ordinary staff position?",0),
 @('2-4','Damián，加油吧！',"Good luck, Damián! You've got this!",0),
 @('2-5','（满意地看着工牌）组长就组长，','(looking at the work ID with satisfaction) Team lead is great.',1),
 @('3-1','工资肯定比普通员工的多。','The salary must be higher than that of ordinary employees.',1),
 @('3-2','（低沉，带回声）命运节点已记录。','(deep, echoing) Fate-node recorded.',1),
 @('3-3','节点：信息安全部。','Node: Cybersecurity Department.',1),
 @('3-4','命运馈赠——顶级黑客之能，此后数字世界再无屏障可阻你脚步。',"Fate's offering-top-tier hacking mastery; from this day forth, no barrier in the digital world shall stand in your way.",1),
 @('3-5','馈赠已赐。','Offering granted.',1),
 @('4-1','（喜）这可是个好东西！','(delighted) This is awesome!',0),
 @('4-2','（喘粗气）完蛋了，迟到了。',"(gasping) Damn, I'm late!",0),
 @('4-3','（娇弱）组长你好，我是您的组员Eloísa。',"(softly) Hello, team lead! I'm Eloísa, one of your team members.",0),
 @('4-4','迟到了真是对不起，我昨天刚结婚，睡得太晚了。',"I'm really sorry for arriving late-I just got married yesterday and overslept.",0),
 @('5-1','（冷声）结婚？你可真会撒谎啊，Eloísa！',"(coldly) Married? You do enjoy lying, Eloísa.",0),
 @('5-2','（震惊）他怎么知道？','(Shocked) How did he know?',1),
 @('5-3','不对，这个声音是……','No, this voice is...',1),
 @('5-4','我说得对吗？Eloísa!','Or am I wrong? Eloísa',0),
 @('6-1','（尖叫）啊！',"(Screams) Ah!",0),
 @('6-2','你，你怎么在这？','You-how are you here?',0),
 @('6-3','（提醒）Eloísa，这是我们的新组长啊。','(Reminds) Eloísa, this is our new team lead.',0),
 @('6-4','难道，（来回打量）你们认识？','Could it be that-(glances around)-you knew each other?',0),
 @('7-1','Eloísa，是我的前女友。','Eloísa is my ex-girlfriend.',0),
 @('7-2','昨天该结婚的时候却逃婚。','She walked out on our wedding yesterday.',0),
 @('7-3','按照公司规定，迟到并虚报原因，',"But rules are rules. Being late and lying about the reason",0),
 @('7-4','记严重警告，扣除当日绩效。',"earns you a serious warning and costs you today's performance bonus.",0),
 @('8-1','（怒吼）Damián！',"(Roaring) Damián!",0),
 @('8-2','除非你现在离职，否则我就不跟你结婚了！','Unless you resign right now, I won\'t marry you!',0),
 @('8-3','你这个渣男！',"You're a total scumbag!",0)
)
foreach($it in $items){
  $cn=Get-CN $it[1]; $en=Get-EN $it[2]
  $isOS=[int]$it[3]
  $secCN=[Math]::Ceiling($cn/$(if($isOS -eq 1){5}else{4}))
  $secEN=[Math]::Ceiling($en/3.5)
  $need=[Math]::Max($secCN,$secEN)
  Write-Host ("{0,-5} cn={1,-3} en={2,-3} need={3}s  (cnSec={4} enSec={5})" -f $it[0],$cn,$en,$need,$secCN,$secEN)
}
