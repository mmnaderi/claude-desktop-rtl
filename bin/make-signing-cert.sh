#!/bin/zsh
# Makes a self-signed code-signing identity "Claude-RTL Signing" in your login keychain, once per Mac.
# Signing with it (CLAUDE_RTL_SIGN="Claude-RTL Signing") keeps the same signature across rebuilds,
# so macOS stops asking for Keychain access after every Claude update. Run it yourself: macOS asks
# for your password to trust the certificate for code signing.
set -e
NAME="Claude-RTL Signing"
KC=$HOME/Library/Keychains/login.keychain-db
if security find-identity -v -p codesigning | grep -q "\"$NAME\""; then
  echo "\"$NAME\" already exists."; exit 0
fi
T=$(mktemp -d); trap 'rm -rf $T' EXIT
# /usr/bin/openssl (LibreSSL) writes a PKCS#12 file that `security import` reads.
/usr/bin/openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj "/CN=$NAME" \
  -addext "basicConstraints=critical,CA:false" -addext "keyUsage=critical,digitalSignature" \
  -addext "extendedKeyUsage=critical,codeSigning" -keyout $T/key.pem -out $T/cert.pem 2>/dev/null
/usr/bin/openssl pkcs12 -export -inkey $T/key.pem -in $T/cert.pem -name "$NAME" -out $T/id.p12 -passout pass:claude-rtl
security import $T/id.p12 -k $KC -P claude-rtl -T /usr/bin/codesign >/dev/null
security add-trusted-cert -p codeSign -k $KC $T/cert.pem
security find-identity -v -p codesigning | grep "\"$NAME\""
echo "Done. Rebuild with: CLAUDE_RTL_SIGN=\"$NAME\" node bin/claude-rtl.mjs"
