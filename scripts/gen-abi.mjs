import { readFileSync, writeFileSync } from "node:fs";

const contracts = [
  { name: "KyralMarketplace", exportName: "kyralMarketplaceAbi", file: "kyral-marketplace" },
  { name: "TestUSDC", exportName: "testUsdcAbi", file: "test-usdc" },
];

for (const { name, exportName, file } of contracts) {
  const { abi } = JSON.parse(
    readFileSync(`contracts/out/${name}.sol/${name}.json`, "utf8")
  );
  writeFileSync(
    `lib/abi/${file}.ts`,
    `// Generated from contracts/out by \`npm run contracts:abi\`. Do not edit.\nexport const ${exportName} = ${JSON.stringify(abi, null, 2)} as const;\n`
  );
}
