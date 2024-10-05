## Python Notes

Note that python setup is now integrated into the top level `npm i` and `npm run clean` scripts.

Not using python much these days so here are some reminders:

- Create a virtual env like this

```console
python3 -m venv venv
```

- Activate virtual env

```console
source venv/bin/activate
```

- Install dependencies with pip

```console
pip3 install -r requirements.txt
```

- Copy the extra yt-dlp plugins

```console
./copy-getpot_bgutil.sh
```

- Run the server

```console
flask --app yt_dlp_api --debug run
```

- Update requirements.txt

```console
pip freeze > requirements.txt
```

- Install a new dependency

```console
  pip3 install gunicorn
```

- https://stackoverflow.com/questions/41457612/how-to-use-requirements-txt-to-install-all-dependencies-in-a-python-project
- https://flask.palletsprojects.com/en/2.2.x/installation/
- https://docs.python.org/3/tutorial/venv.html
- https://docs.brew.sh/Homebrew-and-Python
- https://kindofblue.com/2019/04/simple-json-api-with-flask/
- https://flask-basicauth.readthedocs.io/en/latest/
