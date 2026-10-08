Step 1:- docker rm -f tv-screen-share  



Stop the running container named tv-screen-share if needed, then delete it completely



Step 2:- docker build -t tv-screen-share . 



It updates the folder when changes happen, builds a new image, and saves it to run later.





Step 3:- docker run -d -p 3000:3000 -e SCREEN_SHARE_PIN=123456 --name tv-screen-share tv-screen-share  




Run a background Docker container created from the tv-screen-share image, publish port 3000 to the host machine, set the environment PIN to ABC123, and name the container tv-screen-share.