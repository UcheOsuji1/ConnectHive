// Offering lifecycle only. Financial cancellation is separately budgeted.
export async function cleanupOffering({budget,ownerId,api,finalize=false}) {
  if(!budget.state.hiveId)return;
  if(!finalize&&budget.state.operations?.['result-hive-closure']?.done)return;
  budget.assertOwn('hives',budget.state.hiveId);
  const action=finalize?'close':'pause';
  const result=await api(ownerId,`/billing/hives/${budget.state.hiveId}/${action}`,finalize?{confirm:'CLOSE'}:{});
  budget.state.offeringCleanup=finalize?'closed-after-completion':'paused-after-failure';budget.save();
  return result;
}
