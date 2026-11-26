# Architecture of Cogentic-In-agy: the Cogentic harness (Cai et al., arXiv:2609.40324) as an
# Antigravity swarm. Schematic-led composite, double-column width (183 mm).
# Run from the repository root:  Rscript docs/figure/architecture.R
# Outputs: docs/figure/cogentic_architecture.{svg,pdf,png}

suppressPackageStartupMessages({
  library(ggplot2)
})

W <- 183; H <- 128                        # canvas in mm (= final size)
pt <- function(x) x / .pt                 # font size in pt -> ggplot size units
FONT <- "Times New Roman"

col <- c(
  ink = "#272727", mid = "#6B6B6B", line = "#9A9A9A", light = "#F3F3F3",
  coord = "#3182BD", coord_bg = "#E8F1F9",   # coordinator / swarm (signal blue)
  work = "#33A08F", work_bg = "#E6F4F1",     # workers (signal teal)
  verify = "#D24B40", verify_bg = "#FBEAE8", # verification gate (accent red)
  engine = "#E28E2C", engine_bg = "#FCF1E3"  # state engine (accent orange)
)

box <- function(x0, x1, y0, y1, fill, border, lwd = 0.35, lty = "solid") {
  annotate("rect", xmin = x0, xmax = x1, ymin = y0, ymax = y1,
           fill = fill, colour = border, linewidth = lwd, linetype = lty)
}
txt <- function(x, y, label, size = 5.6, face = "plain", colour = col[["ink"]], hjust = 0, vjust = 1, lh = 1.05, angle = 0) {
  annotate("text", x = x, y = y, label = label, size = pt(size), fontface = face, angle = angle,
           colour = colour, hjust = hjust, vjust = vjust, family = FONT, lineheight = lh)
}
arr <- function(x0, y0, x1, y1, colour = col[["mid"]], lty = "solid", lwd = 0.4, ends = "last") {
  annotate("segment", x = x0, y = y0, xend = x1, yend = y1, colour = colour, linetype = lty,
           linewidth = lwd, arrow = arrow(length = unit(1.3, "mm"), type = "closed", ends = ends))
}
stage <- function(x0, x1, y0, y1, title, detail, fill, border) {
  list(box(x0, x1, y0, y1, fill, border),
       txt(x0 + 1.6, y1 - 1.3, title, size = 6.2, face = "bold", colour = border),
       txt(x0 + 1.6, y1 - 4.6, detail, size = 5.2, colour = col[["ink"]]))
}
panel_label <- function(x, y, l, title) {
  list(txt(x, y, l, size = 8, face = "bold"), txt(x + 3.6, y - 0.35, title, size = 6.4, face = "bold"))
}

p <- ggplot() +
  coord_fixed(xlim = c(0, W), ylim = c(0, H), expand = FALSE) +
  theme_void(base_family = FONT) +
  theme(plot.background = element_rect(fill = "white", colour = NA),
        plot.margin = margin(0, 0, 0, 0)) +

  # ---- title ----------------------------------------------------------------------------------
  txt(4, H - 3, "Cogentic in Antigravity: automated proof discovery as a native swarm", size = 9, face = "bold") +
  txt(4, H - 8.2, paste0("One command, /cogentic <problem>, turns the user's own conversation into the coordinator of a swarm that ",
                         "reproduces the Cogentic harness of Cai et al. (2026) round by round."),
      size = 5.8, colour = col[["mid"]]) +

  # ---- a: coordinator ---------------------------------------------------------------------------
  panel_label(4, 112, "a", "Coordinator") +
  stage(4, 47, 97, 107, "You", "/cogentic <problem>\nwishes in plain words, if any", "white", col[["ink"]]) +
  arr(25.5, 97, 25.5, 93.3) +
  stage(4, 47, 71, 93, "Main conversation = swarm coordinator",
        paste("creates the swarm itself; no extra agent",
              "plans directions from protocol facts",
              "starts, waits for and judges workers",
              "kills finished workers to save quota",
              "never does mathematics (Sec. 2)", sep = "\n"),
        col[["coord_bg"]], col[["coord"]]) +
  arr(25.5, 71, 25.5, 67.3, ends = "both") +
  stage(4, 47, 47, 67, "Quota-aware model choice",
        paste("reads the plan's models and quota",
              "sizes the run: budget, rounds, slots",
              "picks a model for every worker",
              "adapts to per-model outcomes",
              "resizes the run as quota changes", sep = "\n"),
        col[["coord_bg"]], col[["coord"]]) +
  stage(4, 47, 31, 43, "Swarm board and Overview",
        "workers post @coordinator [done]\nnarrator maintains the Overview",
        col[["light"]], col[["mid"]]) +
  arr(25.5, 47, 25.5, 43.3, ends = "both", colour = col[["line"]]) +
  arr(47, 82, 52.4, 82, colour = col[["coord"]], lwd = 0.5) +
  txt(49.9, 75.5, "adds workers", size = 4.6, colour = col[["coord"]], hjust = 0.5, vjust = 0.5, angle = 90) +

  # ---- b: one round -----------------------------------------------------------------------------
  panel_label(52.5, 112, "b", "One round of workers (Sec. 2.1-2.4), repeated; then consolidation (Sec. 2.5)") +
  stage(53, 131, 98, 107, "Literature reviewers",
        "definitions, exact theorem statements, known barriers; re-dispatched when attempts stall",
        col[["work_bg"]], col[["work"]]) +
  arr(92, 98, 92, 95.3) +
  stage(53, 131, 86, 95, "Summarizers, one per prover slot",
        "independent briefings from the record, ledger and literature; long documents passed as paths",
        col[["work_bg"]], col[["work"]]) +
  arr(92, 86, 92, 83.3) +
  box(53, 131, 69, 83, col[["work_bg"]], col[["work"]]) +
  txt(54.6, 81.7, "Provers in parallel", size = 6.2, face = "bold", colour = col[["work"]]) +
  txt(54.6, 78.4, "assigned a direction, not a method; diverse models per round", size = 5.2) +
  lapply(0:3, function(i) list(
    box(56 + i * 18.5, 71 + i * 18.5, 70.6, 75.2, c("#CFEAE4", "#B8E0D8", "#CFEAE4", "#B8E0D8")[i + 1], col[["work"]], lwd = 0.25),
    txt(63.5 + i * 18.5, 74.1, c("draft 1", "draft 2", "draft 3", "draft k")[i + 1], size = 5, hjust = 0.5))) +
  arr(72, 69, 72, 64.3) + arr(112, 69, 112, 64.3) +
  stage(53, 90, 52, 64, "Solo verifier per draft",
        "adversarial, line by line;\nevery citation checked", col[["verify_bg"]], col[["verify"]]) +
  stage(94, 131, 52, 64, "Cross verifier per round",
        "all drafts side by side;\nshared blind spots, ranking", col[["verify_bg"]], col[["verify"]]) +
  txt(92, 50.3, "accepted only if both verifiers pass", size = 5.4, face = "bold", colour = col[["verify"]], hjust = 0.5) +
  arr(92, 47.2, 92, 45.3) +
  stage(53, 131, 36, 45, "Auditor and isolated lemma verifiers",
        "confirmed fragments restated as self-contained lemmas; only re-verified ones enter the ledger",
        col[["work_bg"]], col[["work"]]) +
  arr(92, 36, 92, 33.3) +
  stage(53, 131, 24, 33, "Process advisor",
        "reviews verification logs across the run; standing instructions; no mathematical opinions",
        col[["work_bg"]], col[["work"]]) +
  # loop back to the briefings
  annotate("path", x = c(131, 134, 134, 131.6), y = c(28.5, 28.5, 90.5, 90.5),
           colour = col[["work"]], linewidth = 0.45,
           arrow = arrow(length = unit(1.3, "mm"), type = "closed")) +
  txt(135.6, 45, "next round", size = 4.8, colour = col[["work"]], hjust = 0.5, vjust = 0.5, angle = 90) +
  arr(92, 24, 92, 21.3) +
  box(53, 131, 13, 21, "white", col[["ink"]]) +
  txt(54.6, 19.7, "Consolidation", size = 6.2, face = "bold") +
  txt(54.6, 16.4, "comparator  →  formal writer  →  final audit  →  self-contained manuscript", size = 5.2) +

  # ---- c: state engine --------------------------------------------------------------------------
  panel_label(138, 112, "c", "State engine") +
  box(138, 179, 63, 107, col[["engine_bg"]], col[["engine"]]) +
  txt(139.6, 105.7, "MCP server cogentic_cogentic", size = 6.2, face = "bold", colour = col[["engine"]]) +
  txt(139.6, 102.4, "agy-node, zero dependencies;\nshared run directory, locked writes", size = 5.2) +
  txt(139.6, 95.2, paste(".cogentic/<run>/",
                          "  problem.md, literature/",
                          "  rounds/r<n>/ briefings, drafts,",
                          "      verdicts",
                          "  record.jsonl  (attempts, objections)",
                          "  ledger  (verified lemmas,",
                          "      excluded claims)",
                          "  instructions.md  (advisor)",
                          "  final/manuscript.md", sep = "\n"),
      size = 5, lh = 1.12) +
  box(138, 179, 13, 59, "white", col[["engine"]]) +
  txt(139.6, 57.7, "Enforced in code", size = 6.2, face = "bold", colour = col[["engine"]]) +
  txt(139.6, 54.2, paste("• acceptance needs both verifiers",
                          "• a failing verdict states its objection",
                          "• ledger only after isolated checks",
                          "• dead ends need verified evidence",
                          "• auditor and advisor close",
                          "   every round",
                          "• comparator → writer → final audit",
                          "• budget and user pins",
                          "• calls and outcomes per model", sep = "\n"),
      size = 5, lh = 1.18) +
  arr(131, 102.5, 137.6, 102.5, colour = col[["engine"]], lty = "22", lwd = 0.35) +
  arr(131, 17, 137.6, 17, colour = col[["engine"]], lty = "22", lwd = 0.35) +
  txt(158.5, 61.2, "workers call the cogentic_* tools", size = 4.8, colour = col[["engine"]], hjust = 0.5, vjust = 0.5) +
  # colour key
  txt(139.6, 30.5, "Colour key", size = 5.4, face = "bold") +
  lapply(seq_along(c("coord", "work", "verify", "engine")), function(i) {
    k <- c("coord", "work", "verify", "engine")[i]
    lab <- c("coordinator (main conversation)", "swarm workers", "verification gate", "state engine")[i]
    y <- 27.4 - (i - 1) * 3.3
    list(box(139.8, 143.2, y - 2.1, y, col[[paste0(k, "_bg")]], col[[k]], lwd = 0.3),
         txt(144.6, y - 0.1, lab, size = 5))
  }) +

  # ---- footer: code and citation ----------------------------------------------------------------
  annotate("segment", x = 4, xend = 179, y = 10.2, yend = 10.2, colour = col[["line"]], linewidth = 0.25) +
  txt(4, 8.9, "Code: github.com/Cetirzine/Cogentic-In-agy (MIT licence). Independent implementation from the paper's description; no official code was released. Not affiliated with the authors or Google.",
      size = 4.9, colour = col[["mid"]]) +
  txt(4, 5.2, "Method: Cai, Y., Gupta, V., Jiang, Y., Liaw, C., Mehta, A., Velegkas, G. & Wang, D. Cogentic: Multi-Agent Orchestration for Automated Proof Discovery. arXiv:2609.40324 (2026).",
      size = 4.9, colour = col[["mid"]])

out <- file.path("docs", "figure", "cogentic_architecture")
w <- W / 25.4; h <- H / 25.4
svglite::svglite(paste0(out, ".svg"), width = w, height = h); print(p); invisible(dev.off())
grDevices::cairo_pdf(paste0(out, ".pdf"), width = w, height = h, family = FONT); print(p); invisible(dev.off())
ragg::agg_png(paste0(out, ".png"), width = w, height = h, units = "in", res = 600, background = "white"); print(p); invisible(dev.off())
cat("wrote", out, ".svg/.pdf/.png\n")
