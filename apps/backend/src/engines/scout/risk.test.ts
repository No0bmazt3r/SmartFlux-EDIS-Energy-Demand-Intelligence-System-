import assert from "node:assert/strict";
import { test } from "node:test";
import { ACTION_RISK, gate } from "./index.ts";

test("operational and financial actions always wait for the owner; nothing unknown slips through", () => {
  for (const type of ["switch_tariff", "request_solar_quote"]) {
    assert.equal(ACTION_RISK[type], "financial");
    assert.equal(gate(type), "await_approval");
  }
  for (const type of ["schedule_service", "run_promo", "hold_dryer_start"]) assert.equal(gate(type), "await_approval");
  assert.equal(gate("explain"), "auto");
  assert.throws(() => gate("transfer_money"), /Unknown action/);
});
