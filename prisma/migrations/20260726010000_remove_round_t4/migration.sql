/*
  Warnings:

  - The values [T4] on the enum `Assessment_round` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `Assessment` MODIFY `round` ENUM('T0', 'T1', 'T2', 'T3') NOT NULL;
