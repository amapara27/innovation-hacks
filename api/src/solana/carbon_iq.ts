export type CarbonIq = {
  address: string;
  metadata: {
    name: string;
    version: string;
    spec: string;
    description: string;
    deployments: {
      devnet: string;
    };
  };
  instructions: Array<{
    name: string;
    discriminator: number[];
    accounts: Array<{
      name: string;
      writable?: boolean;
      signer?: boolean;
      address?: string;
    }>;
    args: Array<{
      name: string;
      type: "u64" | "u8";
    }>;
  }>;
  accounts: Array<{
    name: string;
    discriminator: number[];
  }>;
  events: Array<{
    name: string;
    discriminator: number[];
  }>;
  errors: Array<{
    code: number;
    name: string;
    msg: string;
  }>;
  types: Array<{
    name: string;
    type: {
      kind: "struct";
      fields: Array<{
        name: string;
        type: "pubkey" | "u64" | "i64" | "u8";
      }>;
    };
  }>;
};

export const carbonIqIdl: CarbonIq = {
  address: "99ZkMZawmHYwNPyQzseCbEbJFs6mxEYyhJrwdYGadCsR",
  metadata: {
    name: "carbon_iq",
    version: "0.1.0",
    spec: "0.1.0",
    description: "CarbonIQ on-chain proof of environmental impact",
    deployments: {
      devnet: "99ZkMZawmHYwNPyQzseCbEbJFs6mxEYyhJrwdYGadCsR",
    },
  },
  instructions: [
    {
      name: "recordImpact",
      discriminator: [108, 45, 184, 238, 125, 181, 251, 78],
      accounts: [
        { name: "proofOfImpact", writable: true },
        { name: "user" },
        { name: "authority", writable: true, signer: true },
        { name: "systemProgram", address: "11111111111111111111111111111111" },
      ],
      args: [
        { name: "co2OffsetAmount", type: "u64" },
        { name: "creditType", type: "u8" },
      ],
    },
    {
      name: "updateImpact",
      discriminator: [245, 120, 136, 31, 247, 34, 127, 200],
      accounts: [
        { name: "proofOfImpact", writable: true },
        { name: "user" },
        { name: "authority", writable: true, signer: true },
      ],
      args: [
        { name: "additionalOffset", type: "u64" },
        { name: "creditType", type: "u8" },
      ],
    },
  ],
  accounts: [
    {
      name: "proofOfImpact",
      discriminator: [250, 65, 84, 247, 64, 31, 144, 55],
    },
  ],
  events: [
    {
      name: "impactRecorded",
      discriminator: [13, 247, 161, 206, 160, 46, 190, 211],
    },
  ],
  errors: [
    {
      code: 6000,
      name: "overflow",
      msg: "Arithmetic overflow when accumulating offset.",
    },
    {
      code: 6001,
      name: "invalidCreditType",
      msg: "Invalid carbon credit type. Must be 0-5.",
    },
  ],
  types: [
    {
      name: "proofOfImpact",
      type: {
        kind: "struct",
        fields: [
          { name: "userWallet", type: "pubkey" },
          { name: "co2OffsetAmount", type: "u64" },
          { name: "timestamp", type: "i64" },
          { name: "creditType", type: "u8" },
          { name: "bump", type: "u8" },
        ],
      },
    },
    {
      name: "impactRecorded",
      type: {
        kind: "struct",
        fields: [
          { name: "userWallet", type: "pubkey" },
          { name: "co2OffsetAmount", type: "u64" },
          { name: "timestamp", type: "i64" },
          { name: "creditType", type: "u8" },
        ],
      },
    },
  ],
};
