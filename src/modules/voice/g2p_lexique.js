// @ts-check
// g2p_lexique.js : exceptions de prononciation (mot=API), mots outils, lettres, symboles. Données maison (MIT).
// Chargé uniquement avec la voix Lectura HD (jamais au démarrage de l'application).

const brut = (s) => Object.fromEntries(s.trim().split(/\s+/).map((p) => { const i = p.indexOf('='); return [p.slice(0, i), p.slice(i + 1)]; }));

/** Mots outils non accentués. Ceux de TIRET reçoivent « - » comme dans la phonétisation d'origine des voix Piper. */
export const TIRET = new Set(['le', 'la', 'les', 'de', 'du', 'des']);
export const CLITIQUES = new Set(['le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'à', 'a', 'au', 'aux', 'et', 'ou', 'en', 'ce', 'ces', 'cet', 'se', 'ne',
  'que', 'qui', 'on', 'il', 'ils', 'je', 'tu', 'y', 'son', 'sa', 'ses', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'nous', 'vous', 'me', 'te',
  'si', 'par', 'pour', 'sur', 'dans', 'sans', 'vers', 'avec', 'mais', 'chez', 'est', 'sont', 'ont', 'leur', 'leurs', 'notre', 'votre', 'nos', 'vos', 'ai', 'as']);

/** Liaisons simples : le mot (clé) ajoute cette consonne devant une voyelle. */
export const LIAISONS = brut(`les=z des=z mes=z tes=z ses=z ces=z nos=z vos=z nous=z vous=z ils=z elles=z aux=z deux=z trois=z leurs=z
 un=n mon=n ton=n son=n on=n en=n bien=n rien=n est=t sont=t ont=t tout=t petit=t grand=t quand=t c'est=t`);

export const LEXIQUE = brut(`
le=lə la=la les=le de=də du=dy des=de un=œ̃ une=yn et=e est=ɛ es=ɛ a=a à=a ai=e as=a au=o aux=o ou=u où=u en=ɑ̃ y=i
je=ʒə tu=ty il=il ils=il elle=ɛl elles=ɛl on=ɔ̃ nous=nu vous=vu me=mə te=tə se=sə ce=sə ne=nə que=kə qui=ki quoi=kwa
mes=me tes=te ses=se ces=se cet=sɛt cette=sɛt mon=mɔ̃ ton=tɔ̃ son=sɔ̃ leur=lœʁ nos=no vos=vo notre=nɔtʁ votre=vɔtʁ
sont=sɔ̃ ont=ɔ̃ font=fɔ̃ vont=vɔ̃ suis=sɥi êtes=ɛt sommes=sɔm faites=fɛt fait=fɛ faut=fo peut=pø peux=pø veut=vø veux=vø doit=dwa
eu=y eut=y eus=y eue=y avez=ave avons=avɔ̃ été=ete être=ɛtʁ avoir=avwaʁ
plus=ply tous=tus tout=tu toute=tut très=tʁɛ trop=tʁo beaucoup=boku coup=ku loup=lu drap=dʁa sirop=siʁo galop=ɡalo
temps=tɑ̃ corps=kɔʁ champ=ʃɑ̃ camp=kɑ̃ prompt=pʁɔ̃ pays=pei fils=fis sens=sɑ̃s bus=bys virus=viʁys bonus=bonys campus=kɑ̃pys
processus=pʁosesys consensus=kɔ̃sɛ̃sys focus=fokys versus=vɛʁsys cactus=kaktys os=ɔs ours=uʁs mars=maʁs hélas=elas tennis=tenis
bis=bis gratis=ɡʁatis atlas=atlas cosmos=kɔsmos albatros=albatʁos vis=vis jadis=ʒadis
six=sis dix=dis soixante=swasɑ̃t deuxième=døzjɛm sixième=sizjɛm dixième=dizjɛm cinq=sɛ̃k sept=sɛt huit=ɥit vingt=vɛ̃ cent=sɑ̃ second=səɡɔ̃ seconde=səɡɔ̃d
monsieur=məsjø messieurs=mesjø madame=madam femme=fam femmes=fam ville=vil mille=mil tranquille=tʁɑ̃kil août=ut oignon=ɔnjɔ̃ examen=ɛɡzamɛ̃
hier=jɛʁ hiver=ivɛʁ cher=ʃɛʁ mer=mɛʁ fer=fɛʁ ver=vɛʁ fier=fjɛʁ amer=amɛʁ enfer=ɑ̃fɛʁ super=sypɛʁ hyper=ipɛʁ cancer=kɑ̃sɛʁ laser=lazɛʁ
clef=kle clé=kle nerf=nɛʁ cerf=sɛʁ pied=pje nez=ne chez=ʃe assez=ase riz=ʁi outil=uti outils=uti gentil=ʒɑ̃ti fusil=fyzi
blanc=blɑ̃ franc=fʁɑ̃ banc=bɑ̃ tabac=taba estomac=ɛstoma porc=pɔʁ tronc=tʁɔ̃ donc=dɔ̃k
respect=ʁɛspɛ aspect=aspɛ suspect=syspɛ instinct=ɛ̃stɛ̃ distinct=distɛ̃ exact=ɛɡzakt
vient=vjɛ̃ tient=tjɛ̃ viens=vjɛ̃ tiens=tjɛ̃ revient=ʁəvjɛ̃ devient=dəvjɛ̃ contient=kɔ̃tjɛ̃ obtient=ɔptjɛ̃ maintient=mɛ̃tjɛ̃ appartient=apaʁtjɛ̃
soutient=sutjɛ̃ retient=ʁətjɛ̃ convient=kɔ̃vjɛ̃ parvient=paʁvjɛ̃ intervient=ɛ̃tɛʁvjɛ̃ provient=pʁovjɛ̃ bientôt=bjɛ̃to
aujourdhui=oʒuʁdyi vers=vɛʁ univers=ynivɛʁ divers=divɛʁ travers=tʁavɛʁ envers=ɑ̃vɛʁ parfum=paʁfœ̃ automne=otɔn condamner=kɔ̃dane solennel=solanɛl ennemi=ɛnmi évidemment=evidamɑ̃
net=nɛt internet=ɛ̃tɛʁnɛt ethernet=etɛʁnɛt intranet=ɛ̃tʁanɛt but=byt brut=bʁyt sud=syd est-ouest=ɛstwɛst ouest=wɛst
diagnostic=djaɡnostik stagnation=staɡnasjɔ̃ technique=tɛknik techniques=tɛknik technologie=tɛknoloʒi orchestre=ɔʁkɛstʁ écho=eko chaos=kao psychologie=psikoloʒi
archive=aʁʃiv architecture=aʁʃitɛktyʁ chiffrement=ʃifʁəmɑ̃ œil=œj yeux=jø œuvre=œvʁ sœur=sœʁ cœur=kœʁ
aiment=ɛm ferment=fɛʁm dorment=dɔʁm forment=fɔʁm nomment=nɔm estiment=ɛstim expriment=ɛkspʁim confirment=kɔ̃fiʁm affirment=afiʁm
consomment=kɔ̃sɔm transforment=tʁɑ̃sfɔʁm informent=ɛ̃fɔʁm
python=pitɔ̃ bash=baʃ linux=linyks unix=ynyks docker=dɔkɛʁ git=ɡit github=ɡitœb gitlab=ɡitlab kali=kali wireshark=wajʁʃaʁk
metasploit=metasplɔjt burp=bœʁp suite=sɥit phishing=fiʃiŋ malware=malwɛʁ ransomware=ʁɑ̃sɔmwɛʁ spyware=spajwɛʁ software=sɔftwɛʁ hardware=aʁdwɛʁ
firmware=fœʁmwɛʁ hacker=akœʁ hackers=akœʁ hacking=akiŋ hack=ak firewall=fajœʁwol web=wɛb wifi=wifi bluetooth=blutus cloud=klawd
email=imɛl mail=mɛl mails=mɛl online=ɔnlajn offline=ɔflajn login=lɔɡin logout=lɔɡawt password=paswœʁd shell=ʃɛl root=ʁut boot=but reboot=ʁibut
kernel=kɛʁnɛl script=skʁipt scripts=skʁipt javascript=ʒavaskʁipt typescript=tajpskʁipt java=ʒava rust=ʁœst bug=bœɡ bugs=bœɡ debug=debœɡ
byte=bajt bytes=bajt bit=bit bits=bit pixel=piksɛl server=sɛʁvœʁ proxy=pʁɔksi router=ʁutœʁ switch=switʃ spam=spam cookie=kuki cookies=kuki
token=tokɛn tokens=tokɛn hash=aʃ backup=bakœp update=œpdɛt download=dawnlod upload=œplod youtube=jutyb tiktok=tiktɔk google=ɡuɡœl
windows=windoz android=ɑ̃dʁɔid chrome=kʁom firefox=fajœʁfɔks ubuntu=ubuntu debian=debjan nmap=ɛnmap sudo=sudo curl=kœʁl grep=ɡʁɛp
chmod=seaʃmɔd apt=apete wget=dublevegɛt admin=admin plugin=plœɡin bitcoin=bitkɔjn json=ʒizɔn amazon=amazɔn com=kɔm zoom=zum
exploit=ɛksplɔjt exploits=ɛksplɔjt bot=bɔt bots=bɔt botnet=bɔtnɛt input=input output=awtput host=ɔst localhost=lokalɔst hot=ɔt spot=spɔt
ddos=dedɔs dos=dɔs xss=iksɛsɛs ram=ʁam rom=ʁɔm pin=pin gif=ʒif nasa=naza laptop=laptɔp desktop=dɛsktɔp stop=stɔp top=tɔp pop=pɔp zip=zip
clip=klip chip=ʃip cap=kap blog=blɔɡ log=lɔɡ logs=lɔɡ tag=taɡ club=klœb job=dʒɔb open=opɛn source=suʁs framework=fʁɛmwœʁk
frontend=fʁɔntɛnd backend=bakɛnd database=databɛz browser=bʁawzœʁ keylogger=kiloɡœʁ rootkit=ʁutkit backdoor=bakdɔʁ trojan=tʁɔʒan
burkina=buʁkina faso=faso ouagadougou=waɡaduɡu afrique=afʁik mais=mɛ pare=paʁ spoofing=spufiŋ sniffing=snifiŋ brute=bʁyt force=fɔʁs lectura=lɛktyʁa terminal=tɛʁminal node=nɔd vite=vit flutter=flœtœʁ godot=ɡodo
`);

export const LETTRES = brut(`a=a b=be c=se d=de e=ə f=ɛf g=ʒe h=aʃ i=i j=ʒi k=ka l=ɛl m=ɛm n=ɛn o=o p=pe q=ky r=ɛʁ s=ɛs t=te u=y v=ve
 w=dubləve x=iks y=iɡʁɛk z=zɛd`);

/** Symboles lus à voix haute (texte français, repassé ensuite dans le convertisseur). */
export const SYMBOLES = { '@': 'arobase', '%': 'pour cent', '&': 'et', '+': 'plus', '=': 'égal', '/': 'slash', '\\': 'antislash', '#': 'dièse',
  '$': 'dollar', '€': 'euro', '*': 'étoile', '_': 'tiret bas', '|': 'barre', '<': 'inférieur', '>': 'supérieur', '~': 'tilde', '°': 'degré' };
