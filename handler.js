import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import * as datefnstz from "date-fns-tz";
import * as datefns from "date-fns";

const CURRENCY = "SEK";
const AREA = "SE3";

const formatDate = (date) => datefns.format(date, "yyyy-MM-dd");
const toLocal = (date) => datefnstz.toZonedTime(date, "Europe/Stockholm");

const header = (date, area, currency) =>
  `Priser för ${date} i ${area} (${currency}/kWh)`;

const table = (hourly) => {
  let str = "";
  for (const { date, value } of hourly) {
    str += ` ${datefns.format(toLocal(date), "HH")}: ${(value / 1000).toFixed(
      2,
    )}\n`;
  }

  return str;
};

const fetchData = async (date, area, currency) => {
  const res = await fetch(
    `https://dataportal-api.nordpoolgroup.com/api/DayAheadPrices?date=${formatDate(
      date,
    )}&market=DayAhead&deliveryArea=${area}&currency=${currency}`,
  );
  const data = await res.json();
  const hourly = data.multiAreaEntries.map((v) => ({
    date: v.deliveryStart,
    value: v.entryPerArea[area],
  }));

  return {
    deliveryDate: data.deliveryDateCET,
    hourly: hourly,
  };
};

const pricesFor = async (date) => {
  console.log(`Fetching prices for ${date} and ${AREA} (${CURRENCY})`);
  const data = await fetchData(date, AREA, CURRENCY);
  console.log("Prices was fetched! Generating table");

  if (data && data.hourly && data.hourly.length > 0) {
    return `${header(data.deliveryDate, AREA, CURRENCY)}\n${table(
      data.hourly,
    )}`;
  }
  return `Inga priser för ${formatDate(
    datefns.addDays(date, 1),
  )} tillgängliga.`;
};

export const run = async () => {
  const snsClient = new SNSClient({ region: "eu-north-1" });

  try {
    console.log("Starting ...");
    const today = datefns.startOfDay(datefns.addDays(new Date(), 1));
    const text = await pricesFor(today);
    await snsClient.send(
      new PublishCommand({
        Message: text,
        TopicArn: process.env.TOPIC_ARN,
        Subject: `Elpriset för ${formatDate(today)}`,
      }),
    );
    console.log("Done!");
  } catch (error) {
    console.log("Got error");
    console.log(error);

    await snsClient.send(
      new PublishCommand({
        Message: `Kunde inte hämta elpriserna. Fick följande fel:\n${error}`,
        TopicArn: process.env.TOPIC_ARN,
        Subject: `Kunde in skapa elprismail (${formatDate(today)})`,
      }),
    );
    return error;
  }
};
