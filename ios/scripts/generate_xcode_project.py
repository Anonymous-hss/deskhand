from pathlib import Path
import hashlib, plistlib
p=Path(__file__).resolve().parent.parent/'DeskhandMobile'
proj=p/'DeskhandMobile.xcodeproj'; proj.mkdir(exist_ok=True)
def ident(n): return hashlib.sha1(n.encode()).hexdigest()[:24].upper()
def q(v): return '"'+v+'"'
objects=[]
def obj(n,body): objects.append(ident(n)+' = { '+body+' };'); return ident(n)
files=sorted(str(f.relative_to(p)) for f in p.rglob('*.swift') if 'Tests' not in f.parts and '.build' not in f.parts and 'Widgets' not in f.parts and f.name!='Package.swift')
refs=[]; builds=[]
signingRef=obj('signingRef','isa = PBXFileReference; lastKnownFileType = text.xcconfig; path = Configuration/Signing.xcconfig; sourceTree = "<group>";')
for f in files:
 refs.append(obj('ref'+f,'isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = '+q(f)+'; sourceTree = "<group>";'))
 builds.append(obj('build'+f,'isa = PBXBuildFile; fileRef = '+ident('ref'+f)+';'))
app=obj('app','isa = PBXFileReference; explicitFileType = wrapper.application; path = DeskhandMobile.app; sourceTree = BUILT_PRODUCTS_DIR;')
widgetRef=obj('widgetRef','isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = Widgets/DeskhandLiveActivity.swift; sourceTree = "<group>";')
widgetProduct=obj('widgetProduct','isa = PBXFileReference; explicitFileType = "wrapper.app-extension"; path = DeskhandWidgets.appex; sourceTree = BUILT_PRODUCTS_DIR;')
widgetBuild=obj('widgetBuild','isa = PBXBuildFile; fileRef = '+widgetRef+';')
widgetAttributes=obj('widgetAttributes','isa = PBXBuildFile; fileRef = '+ident('refModels/DeskhandActivityAttributes.swift')+';')
embedBuild=obj('embedBuild','isa = PBXBuildFile; fileRef = '+widgetProduct+'; settings = { ATTRIBUTES = (RemoveHeadersOnCopy); };')
embed=obj('embed','isa = PBXCopyFilesBuildPhase; buildActionMask = 2147483647; dstPath = ""; dstSubfolderSpec = 13; files = ('+embedBuild+'); name = "Embed App Extensions"; runOnlyForDeploymentPostprocessing = 0;')
widgetSources=obj('widgetSources','isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = ('+widgetBuild+','+widgetAttributes+'); runOnlyForDeploymentPostprocessing = 0;')
group=obj('group','isa = PBXGroup; children = ('+','.join(refs)+','+signingRef+','+widgetRef+','+ident('products')+'); sourceTree = "<group>";')
obj('products','isa = PBXGroup; children = ('+app+','+widgetProduct+'); name = Products; sourceTree = "<group>";')
sources=obj('sources','isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = ('+','.join(builds)+'); runOnlyForDeploymentPostprocessing = 0;')
frameworks=obj('frameworks','isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0;')
resources=obj('resources','isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0;')
for level in ['project','target','widget']:
 configs=[]
 for mode in ['Debug','Release']:
  settings='CLANG_ENABLE_MODULES = YES; SWIFT_VERSION = 6.0; IPHONEOS_DEPLOYMENT_TARGET = 18.0; SDKROOT = iphoneos; '
  if level=='target': settings+='PRODUCT_BUNDLE_IDENTIFIER = com.deskhand.mobile; PRODUCT_NAME = "$(TARGET_NAME)"; INFOPLIST_FILE = Configuration/Info.plist; TARGETED_DEVICE_FAMILY = "1,2"; CURRENT_PROJECT_VERSION = 1; MARKETING_VERSION = 0.1.0; SWIFT_STRICT_CONCURRENCY = complete; SUPPORTED_PLATFORMS = "iphoneos iphonesimulator"; '
  if level=='widget': settings+='PRODUCT_BUNDLE_IDENTIFIER = com.deskhand.mobile.widgets; PRODUCT_NAME = DeskhandWidgets; INFOPLIST_FILE = Configuration/WidgetInfo.plist; TARGETED_DEVICE_FAMILY = "1,2"; CURRENT_PROJECT_VERSION = 1; MARKETING_VERSION = 0.1.0; APPLICATION_EXTENSION_API_ONLY = YES; SKIP_INSTALL = YES; SUPPORTED_PLATFORMS = "iphoneos iphonesimulator"; '
  if mode=='Debug': settings+='SWIFT_OPTIMIZATION_LEVEL = "-Onone"; DEBUG_INFORMATION_FORMAT = dwarf; SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG; '
  else: settings+='SWIFT_COMPILATION_MODE = wholemodule; SWIFT_OPTIMIZATION_LEVEL = "-O"; '
  configs.append(obj(level+mode,'isa = XCBuildConfiguration; '+('baseConfigurationReference = '+signingRef+'; ' if level != 'project' else '')+'buildSettings = {'+settings+'}; name = '+mode+';'))
 obj(level+'configs','isa = XCConfigurationList; buildConfigurations = ('+','.join(configs)+'); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;')
proxy=obj('widgetProxy','isa = PBXContainerItemProxy; containerPortal = '+ident('project')+'; proxyType = 1; remoteGlobalIDString = '+ident('widgetTarget')+'; remoteInfo = DeskhandWidgets;')
dependency=obj('widgetDependency','isa = PBXTargetDependency; target = '+ident('widgetTarget')+'; targetProxy = '+proxy+';')
obj('widgetTarget','isa = PBXNativeTarget; buildConfigurationList = '+ident('widgetconfigs')+'; buildPhases = ('+widgetSources+'); buildRules = (); dependencies = (); name = DeskhandWidgets; productName = DeskhandWidgets; productReference = '+widgetProduct+'; productType = "com.apple.product-type.app-extension";')
obj('target','isa = PBXNativeTarget; buildConfigurationList = '+ident('targetconfigs')+'; buildPhases = ('+','.join([sources,frameworks,resources,embed])+'); buildRules = (); dependencies = ('+dependency+'); name = DeskhandMobile; productName = DeskhandMobile; productReference = '+app+'; productType = "com.apple.product-type.application";')
obj('project','isa = PBXProject; attributes = { BuildIndependentTargetsInParallel = YES; LastSwiftUpdateCheck = 1600; LastUpgradeCheck = 1600; }; buildConfigurationList = '+ident('projectconfigs')+'; compatibilityVersion = "Xcode 14.0"; developmentRegion = en; hasScannedForEncodings = 0; knownRegions = (en, Base); mainGroup = '+group+'; productRefGroup = '+ident('products')+'; projectDirPath = ""; projectRoot = ""; targets = ('+ident('target')+','+ident('widgetTarget')+');')
(proj/'project.pbxproj').write_text('// !$*UTF8*$!\n{ archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n'+'\n'.join(objects)+'\n}; rootObject = '+ident('project')+'; }\n')
scheme=proj/'xcshareddata/xcschemes'; scheme.mkdir(parents=True,exist_ok=True)
(scheme/'DeskhandMobile.xcscheme').write_text('''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3"><BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="'''+ident('target')+'''" BuildableName="DeskhandMobile.app" BlueprintName="DeskhandMobile" ReferencedContainer="container:DeskhandMobile.xcodeproj"/></BuildActionEntry></BuildActionEntries></BuildAction><LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="'''+ident('target')+'''" BuildableName="DeskhandMobile.app" BlueprintName="DeskhandMobile" ReferencedContainer="container:DeskhandMobile.xcodeproj"/></BuildableProductRunnable></LaunchAction><ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"/><AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/></Scheme>''')
info={'CFBundleDevelopmentRegion':'en','CFBundleDisplayName':'Deskhand','CFBundleExecutable':'$(EXECUTABLE_NAME)','CFBundleIdentifier':'$(PRODUCT_BUNDLE_IDENTIFIER)','CFBundleInfoDictionaryVersion':'6.0','CFBundleName':'$(PRODUCT_NAME)','CFBundlePackageType':'APPL','CFBundleShortVersionString':'$(MARKETING_VERSION)','CFBundleVersion':'$(CURRENT_PROJECT_VERSION)','NSSupportsLiveActivities':True,'LSRequiresIPhoneOS':True,'UILaunchScreen':{},'UIApplicationSceneManifest':{'UIApplicationSupportsMultipleScenes':False},'UISupportedInterfaceOrientations~ipad':['UIInterfaceOrientationPortrait','UIInterfaceOrientationPortraitUpsideDown','UIInterfaceOrientationLandscapeLeft','UIInterfaceOrientationLandscapeRight'],'UISupportedInterfaceOrientations':['UIInterfaceOrientationPortrait','UIInterfaceOrientationLandscapeLeft','UIInterfaceOrientationLandscapeRight'],'NSMicrophoneUsageDescription':'Record a voice command for your team’s Deskhand host.','NSSpeechRecognitionUsageDescription':'Transcribe your command on this device before sending.','NSFaceIDUsageDescription':'Verify your identity before approving a risky browser action.','NSLocalNetworkUsageDescription':'Connect to your team’s Deskhand Windows host on your local network.','NSAppTransportSecurity':{'NSAllowsArbitraryLoads':True,'NSAllowsLocalNetworking':True}}
(p/'Configuration/Info.plist').write_bytes(plistlib.dumps(info))

widgetInfo = {k: v for k,v in info.items() if k.startswith('CFBundle')}
widgetInfo['CFBundleDisplayName']='Deskhand Live Activity'
widgetInfo['CFBundlePackageType']='XPC!'
widgetInfo['NSExtension']={'NSExtensionPointIdentifier':'com.apple.widgetkit-extension'}
(p/'Configuration/WidgetInfo.plist').write_bytes(plistlib.dumps(widgetInfo))
