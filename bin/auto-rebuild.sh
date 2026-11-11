#!/bin/zsh
# Rebuilds Claude-RTL after Claude.app updates. A LaunchAgent runs it when Claude.app's
# Info.plist changes, and every 10 minutes (to catch the moment you quit Claude-RTL).
#   auto-rebuild.sh             rebuild if Claude's version changed (the LaunchAgent runs this)
#   auto-rebuild.sh status      print the decision only, change nothing
#   auto-rebuild.sh install     copy this tool to ~/Library/Application Support/claude-rtl/src and
#                               install the LaunchAgent; re-run after git pull. It keeps CLAUDE_APP, CLAUDE_RTL_DEST,
#                               CLAUDE_RTL_KEEP_ID and CLAUDE_RTL_SIGN from this shell
#   auto-rebuild.sh uninstall   remove the LaunchAgent
#   auto-rebuild.sh selftest
# Log: ~/Library/Logs/claude-rtl-autorebuild.log
SELF=${0:A}   # $0 inside a function is the function name
ROOT=${SELF:h:h}
SRC=${CLAUDE_APP:-/Applications/Claude.app}
DEST=${CLAUDE_RTL_DEST:-$HOME/Applications/Claude-RTL.app}
LABEL=com.claude-rtl.autorebuild
PLIST=$HOME/Library/LaunchAgents/$LABEL.plist
LOG=$HOME/Library/Logs/claude-rtl-autorebuild.log
NOTIFIED=$HOME/Library/Application\ Support/claude-rtl/notified   # one notification per reason and version

version() { [[ -f $1/Contents/Info.plist ]] && /usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' -c 'Print :CFBundleVersion' "$1/Contents/Info.plist" 2>/dev/null | paste -sd ' ' -; }
rtl_running() { pgrep -f "$DEST/Contents/MacOS/" >/dev/null; }
notify_once() {  # $1 key, $2 message
  [[ -f $NOTIFIED && $(<$NOTIFIED) == "$1" ]] && return
  mkdir -p ${NOTIFIED:h} && print -r -- "$1" > $NOTIFIED
  osascript -e "display notification \"$2\" with title \"Claude-RTL\"" 2>/dev/null
}

# Prints "<action> <reason>"; action is one of: none, wait, build.
decide() {
  local sv=$(version $SRC) dv=$(version $DEST)
  [[ -z $sv ]] && { echo "none Claude not found at $SRC"; return; }
  [[ -z $dv ]] && { echo "none Claude-RTL is not installed (run bin/claude-rtl.mjs once)"; return; }
  [[ $sv == $dv ]] && { echo "none up to date ($dv)"; return; }
  (( $(date +%s) - $(stat -f %m "$SRC/Contents/Info.plist") < 60 )) && { echo "wait Claude $sv is still being written"; return; }
  rtl_running && { echo "wait Claude $sv is out; quit Claude-RTL to rebuild ($dv)"; return; }
  echo "build Claude $dv -> $sv"
}

rebuild() {
  local d=$(decide) sv=$(version $SRC)
  [[ $d == build* ]] || {
    [[ $d == wait*quit* ]] && notify_once "quit $sv" "Claude $sv is out. Quit Claude-RTL and it rebuilds by itself."
    return 0
  }
  print "$(date '+%F %T') ${d#build }"
  [[ -d $ROOT/node_modules ]] || npm ci --prefix $ROOT --no-audit --no-fund || return 1
  if ! node $ROOT/bin/claude-rtl.mjs --check; then
    notify_once "check $sv" "Claude $sv changed in a way this patch does not know. Your current Claude-RTL is kept."
    return 1
  fi
  if node $ROOT/bin/claude-rtl.mjs; then
    rm -f $NOTIFIED
    osascript -e "display notification \"Updated to Claude $sv.\" with title \"Claude-RTL\"" 2>/dev/null
  else
    notify_once "fail $sv" "Rebuild for Claude $sv failed. Your current Claude-RTL is kept. Log: $LOG"
    return 1
  fi
}

install_agent() {
  local env="<key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>" v
  for v in CLAUDE_APP CLAUDE_RTL_DEST CLAUDE_RTL_KEEP_ID CLAUDE_RTL_SIGN; do
    [[ -n ${(P)v} ]] && env+="<key>$v</key><string>${(P)v}</string>"
  done
  mkdir -p ${PLIST:h} ${LOG:h}
  # Background jobs may not read ~/Desktop or ~/Documents (macOS privacy), so the agent runs a copy.
  local inst="$HOME/Library/Application Support/claude-rtl/src"
  [[ -d $ROOT/node_modules ]] || npm ci --prefix $ROOT --no-audit --no-fund || return 1
  mkdir -p $inst && rsync -a --delete --exclude .git --exclude test $ROOT/ $inst/ || return 1
  cat > $PLIST <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/zsh</string><string>$inst/bin/auto-rebuild.sh</string></array>
  <key>EnvironmentVariables</key><dict>$env</dict>
  <key>WatchPaths</key><array><string>$SRC/Contents/Info.plist</string></array>
  <key>StartInterval</key><integer>600</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
EOF
  launchctl bootout gui/$(id -u)/$LABEL 2>/dev/null
  launchctl bootstrap gui/$(id -u) $PLIST && echo "installed $LABEL. Now: $(decide)"
}

selftest() {
  local t=$(mktemp -d) out
  fake() { mkdir -p $1/Contents && /usr/libexec/PlistBuddy -c "Add :CFBundleShortVersionString string $2" -c "Add :CFBundleVersion string $2" $1/Contents/Info.plist >/dev/null; }
  SRC=$t/Claude.app DEST=$t/RTL.app
  out=$(decide); [[ $out == "none Claude not found"* ]] || { echo "FAIL missing src: $out"; return 1; }
  fake $SRC 1.0
  out=$(decide); [[ $out == "none Claude-RTL is not installed"* ]] || { echo "FAIL missing dest: $out"; return 1; }
  fake $DEST 1.0
  out=$(decide); [[ $out == "none up to date"* ]] || { echo "FAIL same: $out"; return 1; }
  /usr/libexec/PlistBuddy -c 'Set :CFBundleShortVersionString 1.1' $SRC/Contents/Info.plist
  out=$(decide); [[ $out == "wait"*"still being written" ]] || { echo "FAIL fresh: $out"; return 1; }
  touch -t 202001010000 $SRC/Contents/Info.plist
  out=$(decide); [[ $out == "build Claude 1.0 1.0 -> 1.1 1.0" ]] || { echo "FAIL build: $out"; return 1; }
  rm -rf $t; echo "selftest ok"
}

case $1 in
  status) decide ;;
  install) install_agent ;;
  uninstall) launchctl bootout gui/$(id -u)/$LABEL 2>/dev/null; rm -f $PLIST; echo "removed $LABEL" ;;
  selftest) selftest ;;
  *) rebuild ;;
esac
