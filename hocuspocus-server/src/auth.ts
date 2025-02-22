/**
 * This is a fake implementation of authentication.
 *
 * It parses a token (like userid__READ-WRITE) and returns the userId and role.
 */
export function FAKE_authInfoFromToken(token: string) {
  const parts = token.split("__");

  if (parts.length !== 2) {
    return "unauthorized";
  }

  const role = parts[1];

  if (role !== "COMMENT-ONLY" && role !== "READ-WRITE") {
    return "unauthorized";
  }

  const ret: {
    userId: string;
    role: "COMMENT-ONLY" | "READ-WRITE";
  } = {
    userId: parts[0],
    role,
  };

  return ret;
}
