"""Refused visit/GPS/scope API operations in the explicitly owned fictional company.

Uses private prepared mobile credentials and an ordinary owner web cookie. It
never signs into the physical phone. The empty-fixture precondition and fixed
host/IDs prevent reusing the probe for real customer/employee data.
"""
from pathlib import Path
import argparse
import json
import os
import subprocess
import re
import datetime
import uuid


def run(access_root, out):
    os.umask(0o077)
    ACCESS=access_root
    BASE='https://route-field-acceptance.leaddrivecrm.org'; ORG='route-field-acceptance-v1'
    OUT=out; OUT.mkdir(mode=0o700)

    def private(name):
     p=ACCESS/name
     assert p.is_file() and not p.is_symlink() and p.stat().st_uid==os.getuid() and not p.stat().st_mode&0o077
     return json.loads(p.read_text())
    def save(name,value): (OUT/name).write_text(json.dumps(value,indent=2))
    def q(v): return json.dumps(str(v),ensure_ascii=False)

    def call(actor,path,body=None,method=None):
     assert path.startswith('/api/v1/mtm/') or path=='/api/auth/session'
     assert '//' not in path and '\n' not in path and not path.startswith('//')
     if body is not None:
      assert (method or 'POST') in ['POST','PUT']
      assert path in ['/api/v1/mtm/visits','/api/v1/mtm/mobile/sync/push','/api/v1/mtm/customers/rf-gps-place-v1']
      if path.endswith('rf-gps-place-v1'):assert actor=='owner' and set(body)=={'latitude','longitude'}
     cfg=['url = '+q(BASE+path),'header = '+q('Accept: application/json'),'header = '+q('Content-Type: application/json'),'header = '+q('x-field-apk-version: 3.11.4+61')]
     if actor=='owner':
      cookie=ACCESS/'fixture-owner-web-cookies-private.txt'
      assert cookie.is_file() and not cookie.is_symlink() and not cookie.stat().st_mode&0o077
      cfg+=['cookie = '+q(cookie)]
     else: cfg+=['header = '+q('Authorization: Bearer '+TOKENS[actor])]
     if body is not None:cfg+=['request = '+q(method or 'POST'),'data = '+q(json.dumps(body))]
     done=subprocess.run(['curl','-sS','--max-time','25','--max-redirs','0','--write-out','\n%{http_code}','--config','-'],input='\n'.join(cfg),text=True,capture_output=True,timeout=30)
     assert done.returncode==0,'RF_NEGATIVE_TRANSPORT_FAILED'
     raw,status=done.stdout.rsplit('\n',1);return int(status),json.loads(raw)

    def ok(actor,path):
     s,b=call(actor,path);assert s==200 and b.get('success') is True,'RF_NEGATIVE_PREFLIGHT_REFUSED';return b['data']

    def snapshot():
     v=ok('owner','/api/v1/mtm/visits?range=all&limit=200');assert v['totalExact'] is True and v['sourceTruncated'] is False
     return {v['id']:v for v in v['visits']}

    prepared=private('fixture-access-sanitized.json');assert prepared['status']=='PASS' and prepared['tenantBound'] is True
    TOKENS={}
    for role,identity in [('agent','rf-agent-v1'),('manager','rf-manager-v1'),('outside','rf-other-agent-v1')]:
     a=private('fixture-'+role+'-auth-private.json')['data'];assert a['agent']['id']==identity and a['agent']['organizationId']==ORG and a['agent']['role']==('MANAGER' if role=='manager' else 'AGENT') and a['agent']['email'].endswith('@route-field-acceptance.example.invalid');TOKENS[role]=a['token']
     s,b=call(role,'/api/v1/mtm/mobile/bootstrap');assert s==200 and b['data']['principal']['id']==identity and b['data']['tenant']['id']==ORG and b['data']['principal']['role']==('MANAGER' if role=='manager' else 'AGENT')
     if role=='agent':assert b['data']['policies']['agentPermissions']['checkInOutsideZone'] is False
    s,b=call('owner','/api/auth/session');u=b.get('user') or {};assert s==200 and u.get('id')=='rf-owner-user-v1' and u.get('organizationId')==ORG and u.get('role')=='admin'
    before=snapshot();assert before=={},'RF_FIXTURE_NOT_EMPTY'
    original=ok('owner','/api/v1/mtm/customers/rf-gps-place-v1');assert original['organizationId']==ORG and original['code']=='RF-QA-GPS' and original['geofenceRadius']==250
    assert original['latitude'] is None and original['longitude'] is None
    no_gps=ok('owner','/api/v1/mtm/customers/rf-no-gps-place-v1');assert no_gps['latitude'] is None and no_gps['longitude'] is None
    settings=ok('owner','/api/v1/mtm/settings');assert settings['agentCheckInOutsideZone'] is False
    save('before-private.json',{'visits':before,'gpsPlace':original,'noGpsPlace':no_gps})
    rows=[];raw={};changed=False
    result={'status':'FAIL','tenant':ORG,'testLayer':'authenticated HTTP API; not native GPS proof','wireProfile':'3.11.4+61','realTenantWrites':False,'acceptedVisitsBefore':0,'cases':rows,'sideEffects':'Only a fictional customer point is temporarily set/restored. Rejected sync operations can retain fictional conflict/audit rows; outside-zone attempts can create in-app alerts only for fictional principals.'}
    def check(name,actor,path,body,expected_status,code=None,method=None):
     s,b=call(actor,path,body,method);raw[name]={'httpStatus':s,'body':b}
     actual=b.get('code');good=s==expected_status and (code is None or actual==code)
     rows.append({'case':name,'status':'PASS' if good else 'FAIL','httpStatus':s,'code':actual})
     assert good,'RF_NEGATIVE_CONTRACT_FAILED_'+name
     assert snapshot()==before,'RF_NEGATIVE_ACCEPTED_UNEXPECTED_VISIT'

    def sync(name,data,code=None,validation=False):
     operation={'operationId':str(uuid.uuid4()),'op':'create','entity':'visits','clientTimestamp':int(datetime.datetime.now(datetime.timezone.utc).timestamp()*1000),'data':{'id':'rf-negative-'+uuid.uuid4().hex,'customerId':'rf-gps-place-v1',**data}}
     body={'clientId':'rf-negative-api-v1','operations':[operation]}
     s,b=call('agent','/api/v1/mtm/mobile/sync/push',body);raw[name]={'httpStatus':s,'body':b};r=b.get('results',[{}])[0];actual=(r.get('serverData') or {}).get('code')
     good=s==200 and len(b.get('results',[]))==1 and r.get('operationId')==operation['operationId'] and r.get('status')==('error' if validation else 'conflict') and (code is None or actual==code)
     rows.append({'case':name,'status':'PASS' if good else 'FAIL','httpStatus':s,'operationStatus':r.get('status'),'code':actual})
     assert good,'RF_NEGATIVE_SYNC_CONTRACT_FAILED_'+name
     assert snapshot()==before,'RF_NEGATIVE_ACCEPTED_UNEXPECTED_VISIT'

    try:
     own={'agentId':'rf-agent-v1','customerId':'rf-gps-place-v1'}
     check('latitude-out-of-range','agent','/api/v1/mtm/visits',{**own,'latitude':91,'longitude':49},400)
     check('invalid-force-type','agent','/api/v1/mtm/visits',{**own,'force':'true'},400)
     check('other-agent-target','agent','/api/v1/mtm/visits',{**own,'agentId':'rf-other-agent-v1'},404,'MTM_VISIT_AGENT_NOT_FOUND')
     check('outside-scope-customer','agent','/api/v1/mtm/visits',{**own,'customerId':'rf-other-place-v1'},404,'MTM_VISIT_CUSTOMER_NOT_FOUND')
     check('missing-customer-coordinates','agent','/api/v1/mtm/visits',{**own,'customerId':'rf-no-gps-place-v1','latitude':40.4093,'longitude':49.8671},422,'MTM_VISIT_CUSTOMER_NO_COORDINATES')
     sync('sync-half-gps-pair',{'checkInLat':40.4093},validation=True)
     sync('sync-invalid-gps-range',{'checkInLat':91,'checkInLng':49},validation=True)
     sync('sync-unavailable-route',{'routePointId':'rf-negative-route-point-does-not-exist','checkInLat':40.4093,'checkInLng':49.8671},'MTM_ROUTE_POINT_NOT_AVAILABLE')
     sync('sync-agent-force-refused',{'force':True,'checkInLat':40.4093,'checkInLng':49.8671},'MTM_VISIT_FORCE_FORBIDDEN')
     sync('sync-outside-customer-refused',{'customerId':'rf-other-place-v1','checkInLat':40.4093,'checkInLng':49.8671},'MTM_VISIT_CUSTOMER_NOT_FOUND')
     # Synthetic fixture coordinates; never presented as a physical handset fix.
     changed=True;save('coordinate-restore-private.json',{'status':'RESTORE_REQUIRED','customerId':'rf-gps-place-v1','original':{'latitude':None,'longitude':None},'temporary':{'latitude':40.4093,'longitude':49.8671}})
     s,b=call('owner','/api/v1/mtm/customers/rf-gps-place-v1',{'latitude':40.4093,'longitude':49.8671},'PUT');assert s==200 and b.get('success') is True
     pin=ok('owner','/api/v1/mtm/customers/rf-gps-place-v1');assert pin['latitude']==40.4093 and pin['longitude']==49.8671
     check('agent-force-refused','agent','/api/v1/mtm/visits',{**own,'force':True,'latitude':40.4093,'longitude':49.8671},403,'MTM_VISIT_FORCE_FORBIDDEN')
     check('agent-outside-zone-refused','agent','/api/v1/mtm/visits',{**own,'latitude':40.4293,'longitude':49.8671},400,'MTM_VISIT_OUT_OF_ZONE')
     sync('sync-outside-zone-refused',{'checkInLat':40.4293,'checkInLng':49.8671},'MTM_VISIT_OUT_OF_ZONE')
     result['status']='PASS'
    except Exception as error:
     result['code']=str(error) if re.fullmatch('RF_[A-Za-z0-9_-]+',str(error)) else 'RF_NEGATIVE_PROBE_REFUSED';result['errorType']=type(error).__name__
    finally:
     if changed:
      try:
       now=ok('owner','/api/v1/mtm/customers/rf-gps-place-v1');assert (now['latitude'],now['longitude'])==(40.4093,49.8671),'RF_FIXTURE_COORDINATE_CHANGED_EXTERNALLY'
       s,b=call('owner','/api/v1/mtm/customers/rf-gps-place-v1',{'latitude':None,'longitude':None},'PUT');assert s==200 and b.get('success') is True
       restored=ok('owner','/api/v1/mtm/customers/rf-gps-place-v1');assert restored['latitude'] is None and restored['longitude'] is None and restored['geofenceRadius']==250
       save('coordinate-restore-private.json',{'status':'RESTORED','customerId':'rf-gps-place-v1','originalReadback':True});result['fixtureCoordinatesRestored']=True
      except Exception:
       result['status']='FAIL';result['coordinateRecoveryRequired']=True
     result['allOriginalVisitObjectsUnchanged']=snapshot()==before
     if not result['allOriginalVisitObjectsUnchanged']:result['status']='FAIL'
     result['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save('responses-private.json',raw);save('result-sanitized.json',result)
    print(json.dumps(result));return 0 if result['status']=='PASS' else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--access-root", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    if args.out.resolve().is_relative_to(repo):
        parser.error("Private API output must be outside the checkout")
    try:
        return run(args.access_root, args.out)
    except Exception:
        # Raw HTTP/credential exceptions are never suitable public evidence.
        report = {"status": "FAIL", "code": "RF_NEGATIVE_API_CONTROLLER_REFUSED",
                  "recovery": "Verify the private restoration state before any retry"}
        if args.out.is_dir() and not args.out.is_symlink():
            with (args.out / "controller-failure-sanitized.json").open("x") as output:
                json.dump(report, output)
        print(json.dumps(report))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
