# Calendar functionality for AEM Community Events

The events listed in Recent Recordings section of AEM.live community: `[text](https://www.aem.live/community#recent-recordings)` are dynamically fetched from `community-feeds.json` present in the content source of the site.

## Workflow:
1. Author adds an event to Google Calendar and sends an invite to join the event on Discord.
2. When the event is added to the Google Calendar, a Zapier automation adds a row to the Google Sheets (namely community-feeds) and publishes the sheet.
3. Once the event is complete and a recording is available, author uploads the recording to YouTube.
4. When the new video is added to the YouTube channel, another Zapier automation comes into action to add a row to the google sheet containing the date, URL, title and description of the video, and finally publishing the spreadsheet.
5. The feed block then pulls in the recent recordings data and displays them on the page (with the latest recording available at the top)

### Zap automation to Send Discord Events from Google Calendar to Community Feeds JSON:

![Screenshot 2025-01-09 at 14 55 16](https://github.com/user-attachments/assets/809b3aa6-cd55-41dd-a450-5b82942c0ad8)

### Zap automation to sync YouTube channel videos to google sheets:

![Screenshot 2025-01-09 at 14 53 41](https://github.com/user-attachments/assets/5d58fb2d-9727-47f6-b0e1-8d503412734f)
