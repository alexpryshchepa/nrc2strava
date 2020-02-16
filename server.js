require("dotenv").config();
const fs = require("fs");
const fetch = require("node-fetch");
const path = require("path");
const rimraf = require("rimraf");
const builder = require("xmlbuilder");
const { get, set, find } = require("lodash");
const FormData = require("form-data");

const activitiesFolder = "activities";
const dow = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];

const nikeEndpoints = {
  getActivitiesByTime: time =>
    `https://api.nike.com/sport/v3/me/activities/after_time/${time}`,
  getActivitiesById: uuid =>
    `https://api.nike.com/sport/v3/me/activities/after_id/${uuid}`,
  getActivityById: uuid =>
    `https://api.nike.com/sport/v3/me/activity/${uuid}?metrics=ALL`
};

const nikeFetch = url =>
  fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.NIKE_BEARER}`
    }
  });

const getNikeActivitiesIds = async () => {
  let ids = [];
  let timeOffset = 0;

  while (timeOffset !== undefined) {
    await nikeFetch(nikeEndpoints.getActivitiesByTime(timeOffset))
      .then(res => {
        if (res.status === 401) {
          return Promise.reject("Nike token is not valid");
        }

        if (res.ok) return res.json();

        return Promise.reject("Something went wrong");
      })
      .then(data => {
        const { activities, paging } = data;

        if (activities === undefined) {
          timeOffset = undefined;

          return Promise.reject("Something went wrong. no activities found");
        }

        activities.forEach(a => ids.push(a.id));
        timeOffset = paging.after_time;

        return Promise.resolve(
          `Successfully retrieved ${activities.length} ids`
        );
      })
      .then(msg => console.log(msg))
      .catch(err => console.log(err));
  }

  console.log(`Total ${ids.length} ids retrieved`);
  return ids;
};

const buildGpx = data => {
  const day = dow[new Date(data.start_epoch_ms).getDay()];
  const getISODate = ms => new Date(ms).toISOString();
  const lats = find(data.metrics, ["type", "latitude"]);
  const lons = find(data.metrics, ["type", "longitude"]);
  const elevs = find(data.metrics, ["type", "elevation"]);
  const hrs = find(data.metrics, ["type", "heart_rate"]);
  let points = [];

  const root = {
    gpx: {
      "@creator": "StravaGPX",
      "@xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
      "@xsi:schemaLocation":
        "http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd http://www.garmin.com/xmlschemas/GpxExtensions/v3 http://www.garmin.com/xmlschemas/GpxExtensionsv3.xsd http://www.garmin.com/xmlschemas/TrackPointExtension/v1 http://www.garmin.com/xmlschemas/TrackPointExtensionv1.xsd",
      "@version": "1.1",
      "@xmlns": "http://www.topografix.com/GPX/1/1",
      "@xmlns:gpxtpx":
        "http://www.garmin.com/xmlschemas/TrackPointExtension/v1",
      "@xmlns:gpxx": "http://www.garmin.com/xmlschemas/GpxExtensions/v3",
      metadata: {
        time: getISODate(data.start_epoch_ms)
      },
      trk: {
        name: `${day} run - NRC`,
        type: 9
      }
    }
  };

  if (lats && lons) {
    points = lats.values.map((lat, index) => ({
      time: lat.start_epoch_ms,
      latitude: lat.value,
      longitude: get(lons.values[index], "value")
    }));
  }

  if (elevs) {
    let idx = 0;

    points = points.map(point => {
      if (
        elevs.values[idx].start_epoch_ms < point.time &&
        idx < elevs.values.length - 1
      ) {
        idx++;
      }

      return {
        ...point,
        elevation: elevs.values[idx].value
      };
    });
  }

  if (hrs) {
    let idx = 0;

    points = points.map(point => {
      if (
        hrs.values[idx].start_epoch_ms < point.time &&
        idx < hrs.values.length - 1
      ) {
        idx++;
      }

      return {
        ...point,
        heartrate: hrs.values[idx].value
      };
    });
  }

  set(
    root,
    "gpx.trk.trkseg.trkpt",
    points.map(point => {
      const el = {
        "@lat": point.latitude,
        "@lon": point.longitude,
        time: getISODate(point.time)
      };

      if (point.elevation) {
        el.ele = point.elevation;
      }

      if (point.heartrate) {
        el.extensions = {
          "gpxtpx:TrackPointExtension": {
            "gpxtpx:hr": {
              "#text": point.heartrate
            }
          }
        };
      }

      return el;
    })
  );

  return builder.create(root, { encoding: "UTF-8" }).end({ pretty: true });
};

if (process.argv.includes("nike") && !process.argv.includes("strava")) {
  rimraf(path.join(__dirname, activitiesFolder), () => {
    fs.mkdirSync(path.join(__dirname, activitiesFolder));

    getNikeActivitiesIds().then(ids => {
      ids.map(id => {
        nikeFetch(nikeEndpoints.getActivityById(id))
          .then(res => {
            if (res.status === 401) {
              return Promise.reject("Nike token is not valid");
            }

            if (res.ok) return res.json();

            return Promise.reject("Something went wrong");
          })
          .then(async data => {
            if (data.type !== "run") {
              return Promise.reject("Is not a running activity");
            }

            if (
              !data.metric_types.includes("latitude") &&
              !data.metric_types.includes("longitude")
            ) {
              return Promise.reject("Activity without gps data");
            }

            return await new Promise((resolve, reject) => {
              fs.writeFile(
                path.join(
                  __dirname,
                  activitiesFolder,
                  `activity_${data.id}.gpx`
                ),
                buildGpx(data),
                err => {
                  if (err) {
                    reject(err);
                  }

                  resolve(`Successfully created ${id} activity!`);
                }
              );
            });
          })
          .then(msg => console.log(msg))
          .catch(err => console.log(err));
      });
    });
  });
}

if (process.argv.includes("strava") && !process.argv.includes("nike")) {
  fs.readdir(activitiesFolder, async (err, files) => {
    Promise.all(
      files.map(file => {
        const form = new FormData();

        form.append("description", "Uploaded from NRC");
        form.append("data_type", "gpx");
        form.append("file", fs.createReadStream(`./activities/${file}`));

        return fetch("https://www.strava.com/api/v3/uploads", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.STRAVA_BEARER}`
          },
          body: form
        })
          .then(res => {
            if (res.status === 401) {
              return Promise.reject("Strava token is not valid");
            }

            if (res.ok) return Promise.resolve(`Activity ${file} uploaded`);

            return Promise.reject("Something went wrong");
          })
          .then(msg => console.log(msg))
          .catch(err => console.log(err));
      })
    )
      .then(() => console.log("Finish"))
      .catch(err => console.log(err));
  });
}
