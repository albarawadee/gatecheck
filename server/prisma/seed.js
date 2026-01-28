app.post("/auth/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) return fail(res, 400, "Missing email or password");

    const { data: user, error } = await supabase
      .from("users")
      .select("id,email,role,name,password_hash")
      .eq("email", email)
      .single();

    if (error || !user) return fail(res, 401, "Invalid email or password");

    const okPass = await bcrypt.compare(password, user.password_hash);
    if (!okPass) return fail(res, 401, "Invalid email or password");

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    return ok(res, {
      token,
      user: { email: user.email, role: user.role, name: user.name },
    });
  } catch (e) {
    return fail(res, 500, e.message || "Login failed");
  }
});
