const { eq, and, count, or } = require("drizzle-orm");
const { db, tables } = require("../db.js");

/**
 * Finds all friends of a user
 * @param {import("../schema.js").User} user
 * @returns {Promise<import("../schema.js").UserLink[]>}
 */
async function findFriends(user) {
  const received = await db
    .select({
      username: tables.users.username,
      email: tables.users.email,
      profileUrl: tables.users.profileUrl,
    })
    .from(tables.usersLinks)
    .leftJoin(tables.users, eq(tables.usersLinks.userId2, tables.users.id))
    .where(
      and(
        eq(tables.usersLinks.userId1, user.id),
        eq(tables.usersLinks.deleted, false)
      )
    );
  const sent = await db
    .select({
      username: tables.users.username,
      email: tables.users.email,
      profileUrl: tables.users.profileUrl,
    })
    .from(tables.usersLinks)
    .leftJoin(tables.users, eq(tables.usersLinks.userId1, tables.users.id))
    .where(
      and(
        eq(tables.usersLinks.userId2, user.id),
        eq(tables.usersLinks.deleted, false)
      )
    );

  return {
    received,
    sent,
  };
}

/**
 *
 * @param {import("../schema.js").User} user
 * @param {import("../schema.js").User | number} target
 * @returns {Promise<boolean>}
 */
async function usersAreFriends(user, target) {
  const targetId = typeof target === "number" ? target : target.id;
  const [userLink] = await db
    .select()
    .from(tables.usersLinks)
    .where(
      and(
        or(
          and(
            eq(tables.usersLinks.userId1, user.id),
            eq(tables.usersLinks.userId2, targetId)
          ),
          and(
            eq(tables.usersLinks.userId1, targetId),
            eq(tables.usersLinks.userId2, user.id)
          )
        ),
        eq(tables.usersLinks.deleted, false)
      )
    )
    .limit(1);

  const areFriends = userLink ? true : false;

  return areFriends;
}

/**
 * Soft deleted a link between a user and another user
 * @param {import("../schema.js").User} user
 * @param {import("../schema.js").User} target
 * @returns {Promise<void>}
 */
async function deleteFriendLink(user, target) {
  await db
    .update(tables.usersLinks)
    .set({ deleted: true })
    .where(
      and(
        or(
          and(
            eq(tables.usersLinks.userId1, user.id),
            eq(tables.usersLinks.userId2, target.id)
          ),
          and(
            eq(tables.usersLinks.userId1, target.id),
            eq(tables.usersLinks.userId2, user.id)
          )
        ),
        eq(tables.usersLinks.deleted, false)
      )
    );
}

/**
 * Soft deletes all links between a user and other users
 * @param {number} userId
 * @returns {Promise<void>}
 */
async function setDeleteUserLinks(userId) {
  await db
    .update(tables.usersLinks)
    .set({ deleted: true })
    .where(
      and(
        or(
          eq(tables.usersLinks.userId1, userId),
          eq(tables.usersLinks.userId2, userId)
        ),
        eq(tables.usersLinks.deleted, false)
      )
    );
  return;
}

module.exports = {
  findFriends,
  usersAreFriends,
  deleteFriendLink,
  setDeleteUserLinks,
};
