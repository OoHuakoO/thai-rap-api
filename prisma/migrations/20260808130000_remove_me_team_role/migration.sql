-- ME_TEAM is retired: the programme no longer staffs an M&E seat, so the role
-- and the accounts holding it go together. Deleting first is what makes the
-- ALTER below safe — MySQL would otherwise blank the column on every remaining
-- ME_TEAM row instead of failing.
--
-- RefreshToken, PasswordResetOtp and the _AssignedAssessor join table cascade.
-- Assessment.assessorId, Store.ownerId, News.authorId and Pitching.judgeId are
-- RESTRICT, so a ME_TEAM account that somehow authored one of those aborts this
-- migration rather than orphaning the record — fix the data, then re-run.
DELETE FROM `User` WHERE `role` = 'ME_TEAM';

-- AlterTable
ALTER TABLE `User` MODIFY `role` ENUM('SUPER_ADMIN', 'ADMIN', 'ASSESSOR', 'MENTOR', 'ENTREPRENEUR', 'JUDGE', 'VIEWER') NOT NULL;
