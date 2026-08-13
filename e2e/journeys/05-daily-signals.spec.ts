import { expect, test } from '../fixtures/orbit.fixture';

test('records daily state and explains score and factual load without capacity semantics', async ({
  page,
}) => {
  await page.goto('/day/2026-08-13');
  const signals = page.getByRole('complementary', {
    name: /результат, привычки и состояние/i,
  });
  await expect(signals.getByRole('region', { name: /дневной результат/i })).toContainText(
    /задачи.*привычки.*70%.*30%/is,
  );
  const energyFour = signals.getByRole('button', { name: /^энергия 4$/i });
  const moodThree = signals.getByRole('button', { name: /^настроение 3$/i });
  await energyFour.click();
  await moodThree.click();
  await expect(energyFour).toHaveAttribute('aria-pressed', 'true');
  await expect(moodThree).toHaveAttribute('aria-pressed', 'true');
  await signals.getByLabel(/сон.*минут/i).fill('450');
  await signals.getByRole('button', { name: /сохранить состояние/i }).click();
  await expect(energyFour).toHaveAttribute('aria-pressed', 'true');
  await expect(signals.getByRole('status')).toHaveText(/состояние сохранено/i);
  await page.reload();
  await expect(energyFour).toHaveAttribute('aria-pressed', 'true');
  await expect(moodThree).toHaveAttribute('aria-pressed', 'true');
  await expect(signals.getByLabel(/сон.*минут/i)).toHaveValue('450');
  await expect(
    page.getByText(/перегруз|вместимость|лимит нагрузки|предупреждение о нагрузке/i),
  ).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /плановая нагрузка/i })).toBeVisible();
  await expect(page.getByText(/сумма плановых длительностей задач/i)).toBeVisible();
});
