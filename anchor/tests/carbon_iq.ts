import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CarbonIq } from "../target/types/carbon_iq";
import { expect } from "chai";
import { Keypair, SystemProgram } from "@solana/web3.js";

describe("carbon_iq", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.CarbonIq as Program<CarbonIq>;
  const authority = provider.wallet; // API server wallet (payer + signer)

  // Generate a random "user" keypair (not a signer — just a pubkey for PDA)
  const testUser = Keypair.generate();

  it("Derives the proof PDA deterministically", async () => {
    const [proofPdaA, bumpA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("proof"), testUser.publicKey.toBuffer()],
      program.programId
    );
    const [proofPdaB, bumpB] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("proof"), testUser.publicKey.toBuffer()],
      program.programId
    );

    expect(proofPdaA.toBase58()).to.equal(proofPdaB.toBase58());
    expect(bumpA).to.equal(bumpB);
  });

  it("Records a proof of impact", async () => {
    const [proofPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("proof"), testUser.publicKey.toBuffer()],
      program.programId
    );

    const co2Amount = new anchor.BN(1500); // 1500 grams
    const creditType = 1; // forestry

    await program.methods
      .recordImpact(co2Amount, creditType)
      .accounts({
        proofOfImpact: proofPda,
        user: testUser.publicKey,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const account = await program.account.proofOfImpact.fetch(proofPda);
    expect(account.userWallet.toBase58()).to.equal(
      testUser.publicKey.toBase58()
    );
    expect(account.co2OffsetAmount.toNumber()).to.equal(1500);
    expect(account.creditType).to.equal(1);
    expect(account.timestamp.toNumber()).to.be.greaterThan(0);
  });

  it("Updates an existing proof of impact", async () => {
    const [proofPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("proof"), testUser.publicKey.toBuffer()],
      program.programId
    );

    const additionalOffset = new anchor.BN(500);
    const creditType = 0; // renewable_energy (updates to latest type)

    await program.methods
      .updateImpact(additionalOffset, creditType)
      .accounts({
        proofOfImpact: proofPda,
        user: testUser.publicKey,
        authority: authority.publicKey,
      })
      .rpc();

    const account = await program.account.proofOfImpact.fetch(proofPda);
    expect(account.co2OffsetAmount.toNumber()).to.equal(2000);
    expect(account.creditType).to.equal(0); // updated to renewable_energy
  });

  it("Emits an ImpactRecorded event payload", async () => {
    const eventUser = Keypair.generate();
    const [proofPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("proof"), eventUser.publicKey.toBuffer()],
      program.programId
    );

    const simulation = await program.methods
      .recordImpact(new anchor.BN(777), 2)
      .accounts({
        proofOfImpact: proofPda,
        user: eventUser.publicKey,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .simulate();

    const event = simulation.events[0];
    expect(event).to.not.equal(undefined);
    expect(event?.data.userWallet.toBase58()).to.equal(
      eventUser.publicKey.toBase58()
    );
    expect(event?.data.co2OffsetAmount.toNumber()).to.equal(777);
    expect(event?.data.creditType).to.equal(2);
  });

  it("Rejects invalid credit type", async () => {
    const badUser = Keypair.generate();
    const [proofPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("proof"), badUser.publicKey.toBuffer()],
      program.programId
    );

    try {
      await program.methods
        .recordImpact(new anchor.BN(100), 6) // 6 is out of range (0–5)
        .accounts({
          proofOfImpact: proofPda,
          user: badUser.publicKey,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have thrown an error");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("InvalidCreditType");
    }
  });
});
