import json, subprocess, os, math
sfx=[("error_005",0.12,.5),("click_003",1.15,.3),("click_003",1.7,.3),("impactSoft_medium_001",3.7,.5),
("select_008",4.64,.5),("select_008",5.74,.5),("select_008",6.82,.5),("select_008",7.79,.5),("select_008",8.73,.5),
("impactSoft_medium_001",10.0,.45),("click_002",10.93,.45),("click_002",11.47,.45),("click_002",12.02,.45),("click_002",12.56,.45),
("impactSoft_heavy_003",13.11,.95),("click_002",13.64,.5),("bong_001",13.35,.4),
("impactSoft_medium_001",15.82,.6),("card-slide-1",16.0,.35),("impactSoft_heavy_003",18.55,.7),("switch_007",19.7,.4),("impactBell_heavy_000",20.74,.85),("click_003",21.15,.3)]
def dur(n):
    p='../composition/assets/sfx/%s.ogg'%n
    return math.ceil(100*float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',p],capture_output=True,text=True).stdout.strip() or 1))/100
tags="\n  ".join(f'<audio id="sfx{i}" data-start="{t}" data-duration="{dur(n)}" data-track-index="{20+i}" data-volume="{v}" src="assets/sfx/{n}.ogg"></audio>' for i,(n,t,v) in enumerate(sfx))
d=json.load(open('../composition/beats/audio-reactive.json'))
d={'fps':d['fps'],'bass':d['bass'][:720],'rms':d['rms'][:720]}
h=open('index.template.html').read().replace('__SFX__',tags).replace('__AUDIO__',json.dumps(d,separators=(',',':')))
open('../composition/index.html','w').write(h)
