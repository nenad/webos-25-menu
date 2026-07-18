.PHONY: check package clean

PYTHON ?= python3

check:
	node --check app/app.js
	node --check app/wallpaper.js
	node --test tests/test_wallpaper.js
	$(PYTHON) -m py_compile app/root/remote_mapper.py tools/build_ipk.py tools/generate_icon.py
	sh -n app/root/install.sh
	sh -n app/root/start_mapper.sh
	$(PYTHON) -m unittest discover -s tests -p 'test_*.py'
	sh tests/test_installer.sh

package: check
	$(PYTHON) tools/generate_icon.py
	$(PYTHON) tools/build_ipk.py

clean:
	rm -rf dist app/root/__pycache__ tools/__pycache__ tests/__pycache__
