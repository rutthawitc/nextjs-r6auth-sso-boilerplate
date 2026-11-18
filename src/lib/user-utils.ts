/**
 * Calculates user statistics for admin dashboard
 */
export function calculateUserStats(users: Array<{ role: "admin" | "user"; isActive: boolean }>) {
  const totalUsers = users.length;
  const totalAdmins = users.filter((user) => user.role === "admin").length;
  const activeUsers = users.filter((user) => user.isActive).length;

  return { totalUsers, totalAdmins, activeUsers };
}

/**
 * Determines if a user row is currently being updated
 */
export function isUserRowUpdating(
  userId: string,
  currentUserId: string,
  updateRolePending: boolean,
  updateRoleUserId?: string,
  updateActiveStatusPending?: boolean,
  updateActiveStatusUserId?: string
): boolean {
  const isRoleUpdate = updateRolePending && updateRoleUserId === userId;
  const isActiveStatusUpdate = (updateActiveStatusPending ?? false) && updateActiveStatusUserId === userId;

  return isRoleUpdate || isActiveStatusUpdate;
}
