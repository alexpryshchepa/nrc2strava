# nrc2strava

Most accurate way to migrate from NRC to Strava (includes elevation & heart rate data)

## Install

- Install [Node](https://nodejs.org/)
- **npm install**

## Usage

- Specify **env** variables
- **npm start nike** - fetch all Nike Run Club activities that have **GPS** data and create gpx files
- **npm start strava** - upload all gpx files to Strava

### Notes

1. Gpx file for activity without GPS data will not be created
2. You need to specify **env** variables to fetch and upload
3. You can get **NIKE** refresh token by login to your account - [website](https://www.nike.com/), and look to your browser local storage `unite.nike.com` domain and `com.nike.commerce.nikedotcom.web.credential` key, with next json keys `refresh_token`, `unite_session.clientId`. Do not use logout feature on website, as it will invalidate your token.
4. You can get **Stava** env variables by creating Strava App. Visit `https://www.strava.com/settings/api` to create the app (its free). You can set any valid domain name.
    1. Login into your app, open URL (replace UPPERCASE values first) `https://www.strava.com/oauth/authorize?client_id=CLIENT_ID&response_type=code&redirect_uri=https://YOUR_DOMAIN_FOR_APP&approval_prompt=force&scope=activity:write`
    2. You will be redirected to your app webpage (redirect url) with the `code` query parameter, copy it.
    3. Send one more request to obtain refresh token 
    4. `curl -X POST https://www.strava.com/api/v3/oauth/token -d client_id=CLIENT_ID -d client_secret=CLIENT_SECRET -d code=CODE_STEP_2 -d grant_type=authorization_code`
    5. Set `STRAVA_REFRESH_TOKEN` from the previous request           
5. Duplicated activities will not be loaded
6. It is just a fast working solution
