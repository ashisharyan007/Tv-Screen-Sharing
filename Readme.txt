Choose a PIN that is exactly 6 letters and/or numbers. The PIN is supplied when
the container starts; it is not set in the Docker image. For example, replace
MyPIN9 below with your own 6-character PIN.

Using Docker commands (PowerShell):

docker rm -f tv-screen-share
docker build -t tv-screen-share .
docker run -d -p 3000:3000 -e SCREEN_SHARE_PIN=MyPIN9 --name tv-screen-share tv-screen-share

Using Docker Compose (PowerShell):

$env:SCREEN_SHARE_PIN = "MyPIN9"
docker compose up -d --build

Open https://localhost:3000. If you change the PIN, recreate the container
(or run docker compose up -d --force-recreate) with the new SCREEN_SHARE_PIN
value.