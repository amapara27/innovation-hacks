use anchor_lang::prelude::*;

declare_id!("99ZkMZawmHYwNPyQzseCbEbJFs6mxEYyhJrwdYGadCsR");

#[program]
pub mod carbon_iq {
    use super::*;

    /// Records an on-chain proof of environmental impact.
    /// Called by the API server (authority) on behalf of a user.
    /// The `user` field is passed as an unchecked account — the API server
    /// is the trusted authority that validates user identity off-chain.
    pub fn record_impact(
        ctx: Context<RecordImpact>,
        co2_offset_amount: u64,
        credit_type: u8,
    ) -> Result<()> {
        require!(credit_type <= 5, ErrorCode::InvalidCreditType);

        let proof = &mut ctx.accounts.proof_of_impact;
        let clock = Clock::get()?;

        proof.user_wallet = ctx.accounts.user.key();
        proof.co2_offset_amount = co2_offset_amount;
        proof.timestamp = clock.unix_timestamp;
        proof.credit_type = credit_type;
        proof.bump = ctx.bumps.proof_of_impact;

        msg!(
            "🌱 Impact recorded: {} grams CO₂ offset by {} (credit type: {})",
            co2_offset_amount,
            ctx.accounts.user.key(),
            credit_type
        );

        emit!(ImpactRecorded {
            user_wallet: ctx.accounts.user.key(),
            co2_offset_amount,
            timestamp: clock.unix_timestamp,
            credit_type,
        });

        Ok(())
    }

    /// Allows the authority to update an existing proof (e.g., accumulate offsets).
    pub fn update_impact(
        ctx: Context<UpdateImpact>,
        additional_offset: u64,
        credit_type: u8,
    ) -> Result<()> {
        require!(credit_type <= 5, ErrorCode::InvalidCreditType);

        let proof = &mut ctx.accounts.proof_of_impact;
        let clock = Clock::get()?;

        proof.co2_offset_amount = proof
            .co2_offset_amount
            .checked_add(additional_offset)
            .ok_or(ErrorCode::Overflow)?;
        proof.timestamp = clock.unix_timestamp;
        proof.credit_type = credit_type;

        msg!(
            "🌱 Impact updated: total {} grams CO₂ offset by {} (credit type: {})",
            proof.co2_offset_amount,
            ctx.accounts.user.key(),
            credit_type
        );

        emit!(ImpactRecorded {
            user_wallet: ctx.accounts.user.key(),
            co2_offset_amount: proof.co2_offset_amount,
            timestamp: clock.unix_timestamp,
            credit_type,
        });

        Ok(())
    }
}

// ─── Accounts ────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct RecordImpact<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + ProofOfImpact::INIT_SPACE,
        seeds = [b"proof", user.key().as_ref()],
        bump,
    )]
    pub proof_of_impact: Account<'info, ProofOfImpact>,

    /// The user whose impact is being recorded.
    /// Not required to sign — the API server (authority) acts on their behalf.
    /// CHECK: This is the user's public key used for PDA derivation only.
    pub user: AccountInfo<'info>,

    /// The API server wallet that pays for the transaction.
    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateImpact<'info> {
    #[account(
        mut,
        seeds = [b"proof", user.key().as_ref()],
        bump = proof_of_impact.bump,
    )]
    pub proof_of_impact: Account<'info, ProofOfImpact>,

    /// CHECK: This is the user's public key used for PDA derivation only.
    pub user: AccountInfo<'info>,

    /// The API server wallet that pays for the transaction.
    #[account(mut)]
    pub authority: Signer<'info>,
}

// ─── State ───────────────────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct ProofOfImpact {
    /// The wallet that performed the offset action.
    pub user_wallet: Pubkey, // 32 bytes
    /// Grams of CO₂ offset.
    pub co2_offset_amount: u64, // 8 bytes
    /// Unix timestamp of the last recorded action.
    pub timestamp: i64, // 8 bytes
    /// Carbon credit type (0–5, maps to CarbonCreditType enum).
    pub credit_type: u8, // 1 byte
    /// PDA bump seed.
    pub bump: u8, // 1 byte
}

// ─── Events ──────────────────────────────────────────────────────────────────

#[event]
pub struct ImpactRecorded {
    pub user_wallet: Pubkey,
    pub co2_offset_amount: u64,
    pub timestamp: i64,
    pub credit_type: u8,
}

// ─── Errors ──────────────────────────────────────────────────────────────────

#[error_code]
pub enum ErrorCode {
    #[msg("Arithmetic overflow when accumulating offset.")]
    Overflow,
    #[msg("Invalid carbon credit type. Must be 0–5.")]
    InvalidCreditType,
}
