const { nordpool } = require("nordpool");
const datefns = require("date-fns");
const datefnstz = require("date-fns-tz");
const AWS = require("aws-sdk");
const CURRENCY = "SEK";
const AREA = "SE3";

AWS.config.update({ region: "eu-north-1" });
const prices = new nordpool.Prices();
process.env.TZ = "UTC";

const toLocal = (date) => datefnstz.utcToZonedTime(date, "Europe/Stockholm");

const header = (date, area, currency) =>
  `Priser för ${datefns.format(toLocal(date), "yyyy-MM-dd")} i ${area} (${currency}/kWh)`;

const table = (hourly) => {
  let str = "";
  for (const { date, value } of hourly) {
    str += ` ${datefns.format(toLocal(date), "HH")}: ${(value / 1000).toFixed(
      2
    )}\n`;
  }

  return str;
};

const pricesFor = async (date) => {
  const hourly = await prices.hourly({
    area: AREA,
    currency: CURRENCY,
    from: date
  });

  if (hourly.length > 0) {
    return `${header(datefns.addDays(date, 1), AREA, CURRENCY)}\n${table(hourly)}`;
  } else {
    return `Inga priser för ${datefns.format(datefns.addDays(date, 1), "yyyy-MM-dd")} tillgängliga.`;
  }
};

const publishToSns = async (text) => {
  return await new AWS.SNS()
    .publish({
      Message: text,
      TopicArn: process.env.TOPIC_ARN,
    })
    .promise();
};

module.exports.run = async () => {
  try {
    // The api is a bit weird. This will get "tomorrows" prices
    const date = datefns.startOfDay(datefns.addDays(new Date(), 0));

    await publishToSns(await pricesFor(date));
  } catch (error) {
    return error;
  }
};
