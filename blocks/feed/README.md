# Calendar functionality for AEM Community Events

The events listed in Recent Recordings section of AEM.live community: [https://www.aem.live/community#recent-recordings](https://www.aem.live/community#recent-recordings) are dynamically fetched from `community-feeds.json` present in the content source of the site.

## Workflow:
1. Author adds an event to Google Calendar and sends an invite to join the event on Discord.
2. When the event is added to the Google Calendar, a Zapier automation adds a row to the Google Sheets (namely community-feeds) and publishes the sheet.
3. Once the event is complete and a recording is available, author uploads the recording to YouTube.
4. When the new video is added to the YouTube channel, another Zapier automation comes into action to add a row to the google sheet containing the date, URL, title and description of the video, and finally publishing the spreadsheet.
5. The feed block then pulls in the recent recordings data and displays them on the page (with the latest recording available at the top)

### Zap automation to Send Discord Events from Google Calendar to Community Feeds JSON:

![Screenshot 2025-01-29 at 17 18 25](https://github.com/user-attachments/assets/739b8bb9-8b41-47a2-8029-71f288c86f30)

**Zap Workflow Steps**

_Steps 1 (Checks addition of new event to Google Calendar):_

![image](https://github.com/user-attachments/assets/08fd5b77-ee1b-40f7-b656-d90d366d45af)

![Screenshot 2025-01-29 at 17 20 58](https://github.com/user-attachments/assets/93707862-a3e9-479e-b24a-7619aa8ad1a5)

_Stage 2 (Adds a new row to  helix-upcoming worksheet of `community-feeds` worksheet):_
![Screenshot 2025-01-29 at 17 23 07](https://github.com/user-attachments/assets/2d332186-dda5-474a-887f-3c39a6c40efc)

![Screenshot 2025-01-29 at 17 23 49](https://github.com/user-attachments/assets/7978b9e0-2a75-4bdc-a580-9a9e6661df12)

_Step 3 (Previews the spreadsheet):_
![Screenshot 2025-01-29 at 17 12 55](https://github.com/user-attachments/assets/56d2088c-cb2c-4105-8418-a750dabb712d)

![Screenshot 2025-01-29 at 17 13 11](https://github.com/user-attachments/assets/2f2b0490-bc1d-4e12-8464-6fd53e47e756)

_Step 4 (Publishes the spreadsheet):_
![Screenshot 2025-01-29 at 17 13 44](https://github.com/user-attachments/assets/eae4793a-3f5d-47c9-97d6-a19def9e411f)

![Screenshot 2025-01-29 at 17 13 58](https://github.com/user-attachments/assets/1eaeac10-aa91-4f9c-b17f-4405e2475b2d)


### Zap automation to sync YouTube channel videos to google sheets:

![Screenshot 2025-01-29 at 17 09 11](https://github.com/user-attachments/assets/c8e87d8e-236a-441b-a78b-4113617af3bf)

**Zap Workflow Steps:**

_Step 1 (Monitors the YouTube channel for any new video):_
![Screenshot 2025-01-29 at 17 09 52](https://github.com/user-attachments/assets/d95d3239-1c6b-4f43-be81-089433602241)

![image](https://github.com/user-attachments/assets/0021dc85-396c-465e-b619-1b51d1f333a8)

_Step 2 (Adds details of video in youtube worksheet of `community-feeds` worksheet):_
![Screenshot 2025-01-29 at 17 11 58](https://github.com/user-attachments/assets/ff721691-a7fd-4761-adb2-91a0f4c324b2)

![Screenshot 2025-01-29 at 17 12 26](https://github.com/user-attachments/assets/1ecddb13-34ef-4ab8-8ff1-75aaa519de00)

_Step 3 (Previews the spreadsheet):_
![Screenshot 2025-01-29 at 17 12 55](https://github.com/user-attachments/assets/56d2088c-cb2c-4105-8418-a750dabb712d)

![Screenshot 2025-01-29 at 17 13 11](https://github.com/user-attachments/assets/2f2b0490-bc1d-4e12-8464-6fd53e47e756)

_Step 4 (Publishes the spreadsheet):_
![Screenshot 2025-01-29 at 17 13 44](https://github.com/user-attachments/assets/eae4793a-3f5d-47c9-97d6-a19def9e411f)

![Screenshot 2025-01-29 at 17 13 58](https://github.com/user-attachments/assets/1eaeac10-aa91-4f9c-b17f-4405e2475b2d)
