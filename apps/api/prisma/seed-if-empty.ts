import { prisma } from "../src/lib/prisma";
import { seedDatabase } from "./seed";

async function seedIfEmpty() {
  const userCount = await prisma.user.count();

  if (userCount > 0) {
    console.log(`Intellicash seed skipped; ${userCount} users already exist.`);
    return;
  }

  await seedDatabase();
  console.log("Intellicash seed data created for empty database.");
}

seedIfEmpty()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
