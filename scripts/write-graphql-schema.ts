import { printSchema } from "graphql";
import { schema } from "../server/graphql";
import * as fs from "fs";
import * as path from "path";
import * as prettier from "prettier";

const main = async () => {
  let contents = "### THIS FILE IS AUTO GENERATED\n\n" + printSchema(schema);

  const filePath = path.join(__dirname, "..", "type-definitions.graphql");

  // prettier 3: format() is async.
  contents = await prettier.format(contents, {
    filepath: filePath,
  });

  fs.writeFileSync(filePath, contents, "utf-8");
};

main();
