import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { Prices } from "nordpool";
import datefnstz from "date-fns-tz";
import datefns from "date-fns";

const CURRENCY = "SEK";
const AREA = "SE3";

const toLocal = (date) => datefnstz.utcToZonedTime(date, "Europe/Stockholm");
const header = (date, area, currency) =>
  `Priser för ${datefns.format(
    toLocal(date),
    "yyyy-MM-dd",
  )} i ${area} (${currency}/kWh)`;

const table = (hourly) => {
  let str = "";
  for (const { date, value } of hourly) {
    str += ` ${datefns.format(toLocal(date), "HH")}: ${(value / 1000).toFixed(
      2,
    )}\n`;
  }

  return str;
};

const pricesFor = async (date) => {
  const prices = new Prices();
  const hourly = await prices.hourly({
    area: AREA,
    currency: CURRENCY,
    from: date,
  });

  if (hourly.length > 0) {
    return `${header(datefns.addDays(date, 1), AREA, CURRENCY)}\n${table(
      hourly,
    )}`;
  }
  return `Inga priser för ${datefns.format(
    datefns.addDays(date, 1),
    "yyyy-MM-dd",
  )} tillgängliga.`;
};

export const run = async () => {
  try {
    const text = await pricesFor(
      datefns.startOfDay(datefns.addDays(new Date(), 0)),
    );
    const snsClient = new SNSClient({ region: "eu-north-1" });
    await snsClient.send(
      new PublishCommand({
        Message: text,
        TopicArn: process.env.TOPIC_ARN,
      }),
    );
  } catch (error) {
    return error;
  }
};
