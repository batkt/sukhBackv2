const asyncHandler = require("express-async-handler");
const { db } = require("zevbackv2");
const Blog = require("../models/blog");

exports.blogIlgeeye = asyncHandler(async (req, res, next) => {
  try {
    const { baiguullagiinId, title, content, images } = req.body;

    if (!baiguullagiinId) {
      return res.status(400).json({ success: false, message: "baiguullagiinId is required" });
    }

    const kholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
    );

    if (!kholbolt) {
      return res.status(404).json({ success: false, message: "Холболтын мэдээлэл олдсонгүй" });
    }

    const blogModel = Blog(kholbolt);
    const newBlog = new blogModel({
      baiguullagiinId,
      title,
      content,
      ognoo: new Date(),
    });

    // Handle images if any (assuming they are already uploaded or passed as paths)
    if (images && Array.isArray(images)) {
      newBlog.images = images;
    } else if (req.files && req.files.length > 0) {
      newBlog.images = req.files.map((f) => ({
        path: `medegdel/${baiguullagiinId}/${f.filename}`,
        metadata: { originalName: f.originalname, size: f.size, mimetype: f.mimetype },
      }));
    }

    await newBlog.save();

    // Socket notification
    try {
      const io = req.app.get("socketio");
      if (io) {
        const eventName = "baiguullagiin" + baiguullagiinId;
        io.emit(eventName, {
          type: "blogNew",
          data: newBlog,
          message: "шинэ мэдээлэл орлоо",
        });
        
        // Also notify all residents in that organization
        io.emit("blogUpdate", {
            baiguullagiinId,
            message: "шинэ мэдээлэл орлоо"
        });
      }
    } catch (socketError) {
      console.error("Socket emit error:", socketError);
    }

    res.json({ success: true, data: newBlog, message: "Блог амжилттай үүсгэгдлээ" });
  } catch (error) {
    next(error);
  }
});

exports.blogAvya = asyncHandler(async (req, res, next) => {
  try {
    const { baiguullagiinId } = req.query;

    if (!baiguullagiinId) {
      return res.status(400).json({ success: false, message: "baiguullagiinId is required" });
    }

    const kholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
    );

    if (!kholbolt) {
      return res.status(404).json({ success: false, message: "Холболтын мэдээлэл олдсонгүй" });
    }

    const query = { baiguullagiinId };

    const list = await Blog(kholbolt).find(query).sort({ createdAt: -1 }).lean();

    res.json({ success: true, data: list });
  } catch (error) {
    next(error);
  }
});

exports.blogZasah = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const { baiguullagiinId, title, content } = req.body;

    if (!id || !baiguullagiinId) {
      return res.status(400).json({ success: false, message: "id and baiguullagiinId are required" });
    }

    const kholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
    );

    if (!kholbolt) {
      return res.status(404).json({ success: false, message: "Холболтын мэдээлэл олдсонгүй" });
    }

    const updateData = { title, content, updatedAt: new Date() };
    
    // Handle new images if any
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map((f) => ({
        path: `medegdel/${baiguullagiinId}/${f.filename}`,
        metadata: { originalName: f.originalname, size: f.size, mimetype: f.mimetype },
      }));
      // Decide whether to append or replace. Let's assume replace for now or handle via client instruction.
      // For simplicity, let's just update fields provided.
      updateData.images = newImages; 
    }

    const updatedBlog = await Blog(kholbolt).findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );

    if (!updatedBlog) {
      return res.status(404).json({ success: false, message: "Блог олдсонгүй" });
    }

    res.json({ success: true, data: updatedBlog, message: "Блог амжилттай шинэчлэгдлээ" });
  } catch (error) {
    next(error);
  }
});

exports.blogReaction = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const { baiguullagiinId, emoji, orshinSuugchId } = req.body;

    if (!id || !baiguullagiinId || !emoji || !orshinSuugchId) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const kholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
    );

    if (!kholbolt) {
      return res.status(404).json({ success: false, message: "Холболтын мэдээлэл олдсонгүй" });
    }

    const blog = await Blog(kholbolt).findById(id);
    if (!blog) {
      return res.status(404).json({ success: false, message: "Блог олдсонгүй" });
    }

    // Check if user already reacted with this emoji
    const reactionIndex = blog.reactions.findIndex((r) => r.emoji === emoji);

    if (reactionIndex > -1) {
      const userIndex = blog.reactions[reactionIndex].users.indexOf(orshinSuugchId);
      if (userIndex > -1) {
        // Remove reaction (toggle off)
        blog.reactions[reactionIndex].users.splice(userIndex, 1);
        blog.reactions[reactionIndex].count = Math.max(0, blog.reactions[reactionIndex].count - 1);
      } else {
        // Add reaction
        blog.reactions[reactionIndex].users.push(orshinSuugchId);
        blog.reactions[reactionIndex].count += 1;
      }
    } else {
      // New emoji reaction
      blog.reactions.push({
        emoji,
        count: 1,
        users: [orshinSuugchId],
      });
    }

    await blog.save();

    // Socket notification for reaction
    try {
      const io = req.app.get("socketio");
      if (io) {
        const eventName = "baiguullagiin" + baiguullagiinId;
        io.emit(eventName, {
          type: "blogReactionUpdate",
          data: {
            blogId: id,
            reactions: blog.reactions,
          },
        });
      }
    } catch (socketError) {
      console.error("Socket emit error:", socketError);
    }

    res.json({ success: true, data: blog });
  } catch (error) {
    next(error);
  }
});

exports.blogUstgakh = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const { baiguullagiinId } = req.query || req.body;

    if (!id || !baiguullagiinId) {
      return res.status(400).json({ success: false, message: "id and baiguullagiinId are required" });
    }

    const kholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
    );

    if (!kholbolt) {
      return res.status(404).json({ success: false, message: "Холболтын мэдээлэл олдсонгүй" });
    }

    await Blog(kholbolt).findByIdAndDelete(id);

    res.json({ success: true, message: "Блог амжилттай устгагдлаа" });
  } catch (error) {
    next(error);
  }
});
