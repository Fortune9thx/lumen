"""
Mandatory pre-submission deliverable: proves every protected write reverts
cleanly for an unauthorized/random wallet and leaves contract state
unchanged. Uses gltest's built-in direct_alice/direct_bob accounts as the
"funded random wallets" (direct-mode calls don't require real GEN balance
to originate a call the way a live network would, but the authorization
check itself is identical code to what runs on-chain).

Access control matrix (see SECURITY.md for the full table):
  create_flight_policy / create_weather_policy -- permissionless by design
    (anyone may buy their own coverage); not tested here as "unauthorized."
  cancel_policy         -- policy owner only
  submit_claim          -- policy owner only
  judge_claim           -- policy owner OR contract owner only
  withdraw_from_pool    -- contract owner only
  pause_contract        -- contract owner only
  unpause_contract      -- contract owner only
  add_pool_funds        -- permissionless by design (anyone may top up the
    shared pool); not tested here as "unauthorized."
"""
import json

import pytest

CONTRACT_PATH = "contracts/LumenInsurance.py"
GEN_WEI = 1_000_000_000_000_000_000


@pytest.fixture
def contract(direct_deploy):
    return direct_deploy(CONTRACT_PATH, sdk_version="v0.2.16")


def _create_flight_policy_as(contract, direct_vm, sender, coverage_gen=100, premium_gen=150):
    direct_vm.sender = sender
    direct_vm.value = premium_gen * GEN_WEI
    try:
        return contract.create_flight_policy(
            flight_number="BA287", flight_date="2026-09-12",
            coverage_text="Pay 100 GEN if BA287 is cancelled.",
            coverage_amount_gen=coverage_gen, premium_gen=premium_gen,
            expiry="2026-09-12",
        )
    finally:
        direct_vm.value = 0


class TestAccessControlMatrix:
    def test_random_wallet_cannot_cancel_someone_elses_policy(self, contract, direct_vm, direct_alice, direct_bob):
        _create_flight_policy_as(contract, direct_vm, direct_alice)

        direct_vm.sender = direct_bob
        with pytest.raises(Exception):
            contract.cancel_policy(policy_id="pol_1")

        # State unchanged: policy still active, reserved liability untouched.
        policy = json.loads(contract.get_policy(policy_id="pol_1"))
        assert policy["status"] == "active"
        pool = json.loads(contract.get_pool_status())
        assert pool["reserved_liability_wei"] == str(100 * GEN_WEI)

    def test_random_wallet_cannot_submit_claim_for_someone_elses_policy(self, contract, direct_vm, direct_alice, direct_bob):
        _create_flight_policy_as(contract, direct_vm, direct_alice)

        direct_vm.sender = direct_bob
        with pytest.raises(Exception):
            contract.submit_claim(policy_id="pol_1", description="x" * 25, evidence_urls="https://example.com")

        claims = json.loads(contract.list_claims_by_policy(policy_id="pol_1"))
        assert claims == []

    def test_random_wallet_cannot_trigger_judgment_on_someone_elses_claim(self, contract, direct_vm, direct_alice, direct_bob):
        _create_flight_policy_as(contract, direct_vm, direct_alice)
        direct_vm.sender = direct_alice
        contract.submit_claim(policy_id="pol_1", description="BA287 was cancelled." + "x" * 10, evidence_urls="https://flightaware.com/live/flight/BA287")

        direct_vm.sender = direct_bob
        with pytest.raises(Exception):
            contract.judge_claim(claim_id="clm_1")

        claim = json.loads(contract.get_claim(claim_id="clm_1"))
        assert claim["status"] == "pending"

    def test_random_wallet_cannot_withdraw_from_pool(self, contract, direct_vm, direct_bob):
        direct_vm.value = 50 * GEN_WEI
        try:
            contract.add_pool_funds()
        finally:
            direct_vm.value = 0

        direct_vm.sender = direct_bob
        with pytest.raises(Exception):
            contract.withdraw_from_pool(amount_gen=10)

        pool = json.loads(contract.get_pool_status())
        assert pool["pool_balance_wei"] == str(50 * GEN_WEI)  # unchanged

    def test_random_wallet_cannot_pause_contract(self, contract, direct_vm, direct_bob):
        direct_vm.sender = direct_bob
        with pytest.raises(Exception):
            contract.pause_contract()
        assert contract.is_paused() is False

    def test_random_wallet_cannot_unpause_contract(self, contract, direct_vm, direct_bob):
        contract.pause_contract()  # called as the deployer/owner (default sender)

        direct_vm.sender = direct_bob
        with pytest.raises(Exception):
            contract.unpause_contract()
        assert contract.is_paused() is True

    def test_policy_owner_can_trigger_own_claim_judgment(self, contract, direct_vm, direct_alice):
        """Positive control: the restriction is on identity, not on the action itself."""
        _create_flight_policy_as(contract, direct_vm, direct_alice, coverage_gen=100, premium_gen=150)
        direct_vm.sender = direct_alice
        contract.submit_claim(policy_id="pol_1", description="BA287 was cancelled." + "x" * 10, evidence_urls="https://flightaware.com/live/flight/BA287")

        direct_vm.clear_mocks()
        direct_vm.mock_llm(".*", json.dumps({"decision": "rejected", "reasoning": "No evidence."}))
        status = contract.judge_claim(claim_id="clm_1")
        assert status == "rejected"

    def test_contract_owner_can_also_trigger_judgment_as_a_keeper(self, contract, direct_vm, direct_alice):
        """Positive control: the contract owner can act as a permissionless
        keeper to settle claims even if the claimant never calls back."""
        _create_flight_policy_as(contract, direct_vm, direct_alice, coverage_gen=100, premium_gen=150)
        direct_vm.sender = direct_alice
        contract.submit_claim(policy_id="pol_1", description="BA287 was cancelled." + "x" * 10, evidence_urls="https://flightaware.com/live/flight/BA287")

        # direct_vm.sender defaults back to the deployer/owner account for this call.
        direct_vm.clear_mocks()
        direct_vm.mock_llm(".*", json.dumps({"decision": "rejected", "reasoning": "No evidence."}))
        status = contract.judge_claim(claim_id="clm_1")
        assert status == "rejected"
