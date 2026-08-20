// A stand-in solver speaking the SolverProcess protocol, so that the framing
// can be tested without a container. The first field selects the behaviour.
const encode = (field: string) => Buffer.from(field, "utf8").toString("base64");
const decode = (field: string) => Buffer.from(field, "base64").toString("utf8");

for await (const line of console) {
  const fields = line.trim().split(" ").map(decode);
  const [verb, ...rest] = fields;

  switch (verb) {
    case "fail":
      console.log(`ERR ${encode(rest.join(" "))}`);
      break;
    case "unframed":
      console.log("what?");
      break;
    case "complain":
      console.error(rest.join(" "));
      console.log(`OK ${encode("")}`);
      break;
    case "die":
      process.exit(0);
      break;
    case "slow":
      await Bun.sleep(Number(rest[0]));
      console.log(`OK ${encode(rest.slice(1).join(" "))}`);
      break;
    default:
      console.log(`OK ${encode(fields.join("|"))}`);
  }
}
