#!/usr/bin/env python3
"""Sign a development archive using an existing certificate/profile; never create credentials."""
import argparse
import datetime
import fnmatch
import hashlib
from pathlib import Path
import plistlib
import shutil
import subprocess
import tempfile
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--archive', type=Path, required=True)
parser.add_argument('--profile', type=Path, required=True)
parser.add_argument('--identity', required=True, help='SHA-1 fingerprint of an existing development signing identity')
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
profile = plistlib.loads(subprocess.check_output(['security', 'cms', '-D', '-i', str(args.profile)], stderr=subprocess.DEVNULL))
assert profile['ExpirationDate'] > datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None), 'Provisioning profile has expired'
assert profile['Entitlements'].get('get-task-allow'), 'Use an existing development profile'
assert args.identity.upper() in {hashlib.sha1(cert).hexdigest().upper() for cert in profile['DeveloperCertificates']}, 'Profile does not contain this signing certificate'
assert not args.output.exists(), 'Output already exists; select a fresh archive output path'
shutil.copytree(args.archive, args.output)
app = next((args.output / 'Products/Applications').glob('*.app'))
team = profile['TeamIdentifier'][0]
components = sorted(app.glob('PlugIns/*.appex')) + [app]
with tempfile.TemporaryDirectory(prefix='deskhand-sign-') as temporary:
    for component in components:
        info = plistlib.loads((component / 'Info.plist').read_bytes())
        identifier = team + '.' + info['CFBundleIdentifier']
        assert fnmatch.fnmatchcase(identifier, profile['Entitlements']['application-identifier']), 'Profile does not permit this bundle ID'
        shutil.copyfile(args.profile, component / 'embedded.mobileprovision')
        entitlements = {'application-identifier': identifier,
                        'com.apple.developer.team-identifier': team,
                        'get-task-allow': True,
                        'keychain-access-groups': [identifier]}
        file = Path(temporary) / (component.stem + '.plist')
        file.write_bytes(plistlib.dumps(entitlements))
        subprocess.run(['codesign', '--force', '--sign', args.identity, '--entitlements', str(file), '--generate-entitlement-der', str(component)], check=True)
        subprocess.run(['codesign', '--verify', '--strict', str(component)], check=True)
archive_info = plistlib.loads((args.output / 'Info.plist').read_bytes())
archive_info['ApplicationProperties']['SigningIdentity'] = 'Apple Development'
archive_info['ApplicationProperties']['Team'] = team
(args.output / 'Info.plist').write_bytes(plistlib.dumps(archive_info))
ipa = args.output.with_suffix('.ipa')
with zipfile.ZipFile(ipa, 'w', zipfile.ZIP_DEFLATED) as package:
    for file in app.rglob('*'):
        if file.is_file(): package.write(file, Path('Payload') / app.name / file.relative_to(app))
print('Signed development archive:', args.output)
print('Development IPA:', ipa)
