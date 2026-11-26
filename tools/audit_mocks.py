"""全採用版を横断検査。意味的・史実の正しさは機械検査の保証外。"""
from pathlib import Path
import json, csv, re, unicodedata, collections, itertools, hashlib
from urllib.parse import urlparse
root=Path(__file__).resolve().parent.parent
out=root/'qa'; out.mkdir(exist_ok=True)
def load(p):return json.loads(p.read_text())
def norm(s):return re.sub(r'\s+','',unicodedata.normalize('NFKC',s))
def csvout(name,fields,rows):
 with (out/name).open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.writer(f);w.writerow(fields);w.writerows(rows)
sets=[load(root/'data'/f'mock-2026-{i:02}.json') for i in range(1,6)]
qs=[q for d in sets for q in d['questions']]
old=load(root/'data/questions.json')+load(root/'data/theme-2026-toyotomi.json')['questions']; allq=old+qs
assert len(old)==1200 and len(qs)==500 and len({q['id'] for q in allq})==1700
assert all(q['correct'] in q['choices'] for q in allq)
base_categories=['歴史・史跡','神社・寺院','建築・庭園・美術','伝統文化・芸能','祭礼・行事','生活文化','地理・観光・時事','豊臣家と京都','特集①','特集②']
fields=['id','grade','year','mock','questionNumber','type','sourceType','category','subcategory','difficulty','question','choices','correct','explanation','sourceUrls','tags','difficultyTarget','reviewStatus']
rounds=[]
for i,d in enumerate(sets,1):
 assert d['meta']['version']=='1.2' and d['meta']['mock']==i and len(d['questions'])==100
 positions=collections.Counter(); difficulty=collections.Counter();
 for n,q in enumerate(d['questions'],1):
  assert all(k in q for k in fields) and q['id']==f'mock-2026-{i:02}-{n:03}' and q['mock']==i and q['questionNumber']==n and q['grade']==2 and q['year']==2026 and q['type']=='choice' and q['sourceType']=='mock'
  assert q['category']==base_categories[(n-1)//10]
  assert q['difficulty'] in ['基本','標準','やや難','難'] and len(q['choices'])==4 and len(set(map(norm,q['choices'])))==4 and q['correct'] in q['choices']
  assert all(isinstance(q[k],str) and q[k].strip() for k in ['question','correct','explanation','subcategory']) and all(isinstance(s,str) and s.strip() for s in q['choices'])
  assert q['sourceUrls'] and all(urlparse(u).scheme in ('http','https') and urlparse(u).netloc for u in q['sourceUrls'])
  positions[q['choices'].index(q['correct'])+1]+=1;difficulty[q['difficulty']]+=1
 assert sorted(positions.values())==[25]*4
 assert len(set(norm(q['correct']) for q in d['questions']))==100
 rounds.append({'round':i,'count':100,'answer_positions':dict(positions),'difficulty':dict(difficulty),'specialThemes':d['meta']['specialThemes']})
assert len(set(norm(q['question']) for q in qs))==500
old_stems={norm(q['question']) for q in old}; assert not any(norm(q['question']) in old_stems for q in qs)
# 同じ答えは同一の知識関係とは限らないため候補として抽出。
byanswer=collections.defaultdict(list)
for q in allq:byanswer[norm(q['correct'])].append(q)
collisions=[]
for q in qs:
 for other in byanswer[norm(q['correct'])]:
  if other['id']==q['id'] or (other in qs and other['id']<q['id']):continue
  collisions.append([q['id'],other['id'],q['correct'],q['question'],other['question']])
csvout('answer-collisions.csv',['mock_id','other_id','answer','mock_question','other_question'],collisions)
leaks=[]
for q in qs:
 for o in qs:
  if q['id']==o['id']:continue
  a=norm(q['correct'])
  if len(a)>=3 and a in norm(o['question']):leaks.append([q['id'],o['id'],q['correct'],q['mock']==o['mock'],o['question']])
csvout('literal-hints.csv',['answer_id','stem_id','answer','same_round','stem'],leaks)
# 文字n-gramによる類似度。1700件のうち各模試問題の上位3候補。
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
X=TfidfVectorizer(analyzer='char',ngram_range=(2,4),min_df=1).fit_transform([norm(q['question']) for q in allq]);scores=cosine_similarity(X[-500:],X)
rows=[]
for i,q in enumerate(qs):
 scores[i,len(old)+i]=-1
 for rank,j in enumerate(scores[i].argsort()[-3:][::-1],1):rows.append([q['id'],rank,allq[j]['id'],round(float(scores[i,j]),5),q['question'],allq[j]['question'],q['correct'],allq[j]['correct']])
csvout('similarity-top3.csv',['mock_id','rank','other_id','similarity','mock_question','other_question','mock_answer','other_answer'],rows)
summary={'total_questions':len(allq),'past_and_theme':len(old),'mock_questions':len(qs),'unique_ids':len({q['id'] for q in allq}),'required_field_checks':'pass','mock_choices':sum(len(q['choices']) for q in qs),'mock_explanations':sum(bool(q['explanation']) for q in qs),'mock_url_presence_format':500,'exact_mock_stem_matches':0,'exact_matches_vs_old':0,'mock_to_mock_answer_pairs':sum(x[1].startswith('mock-') for x in collisions),'mock_to_old_answer_pairs':sum(not x[1].startswith('mock-') for x in collisions),'same_round_literal_hint_candidates':sum(x[3] for x in leaks),'all_mock_literal_hint_candidates':len(leaks),'difficulty':dict(collections.Counter(q['difficulty'] for q in qs)),'rounds':rounds,'data_sha256':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted((root/'data').glob('*.json')) if f.name!='places.json'},'limits':['典拠URLは存在・形式のみ。到達性・史実・全誤答の網羅的検証はしていない。','正答の意味的重複、間接的ヒント、解説の意味整合は自動判定していない。','難易度は各採用版の定性的推定。']}
(out/'data-audit.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in summary.items() if k not in ['rounds','data_sha256','limits']},ensure_ascii=False,indent=2))
