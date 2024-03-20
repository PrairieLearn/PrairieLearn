const fs = require('fs-extra');
const execa = require('execa');

const prefixZero = (value) => ('0' + value).slice(-2);

function formatDate(date) {
  return `${date.getFullYear()}${prefixZero(date.getMonth() + 1)}${prefixZero(
    date.getDate(),
  )}${prefixZero(date.getHours())}${prefixZero(date.getMinutes())}${prefixZero(date.getSeconds())}`;
}

(async () => {
  const rawMigrations = await fs.readdir('./migrations');
  const migrations = rawMigrations.filter((m) => m.endsWith('.sql'));
  let lastMigrationDate = '';
  for (const migration of migrations) {
    if (migration.match(/^\d{14}/)) {
      // Filename already has a timestamp.
      continue;
    }

    const res = await execa('git', [
      'log',
      '--follow',
      '--format=%aI',
      '--',
      `migrations/${migration}`,
    ]);
    const dates = res.stdout.trim().split('\n').reverse();

    // Select the earliest commit date that is also after the previous date.
    let migrationDate;
    if (!lastMigrationDate) {
      migrationDate = dates[0];
    } else {
      migrationDate = dates.find((d) => new Date(d) > new Date(lastMigrationDate));
    }

    // If there was no appropriate commit date, just add one to the last migration date.
    if (!migrationDate) {
      let newDate = new Date(lastMigrationDate);
      newDate.setSeconds(newDate.getSeconds() + 1);
      migrationDate = newDate.toISOString();
    }
    console.log('lastMigrationDate', lastMigrationDate);
    console.log('migrationDate', migrationDate);
    console.log('all dates', dates);
    const formattedDate = formatDate(new Date(migrationDate));
    let newName = `${formattedDate}_${migration}`;
    console.log(`Renaming ${migration} to ${newName}`);
    await fs.move(`migrations/${migration}`, `migrations/${newName}`);
    console.log('-----');

    if (migrationDate) {
      lastMigrationDate = migrationDate;
    }
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
