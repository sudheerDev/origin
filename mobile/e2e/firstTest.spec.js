describe('Example', () => {
  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('should display a loading screen', async () => {
    await expect(element(by.id('LoadingMarketplace'))).toBeVisible();
  });
});
