class aldaa extends Error {
  constructor(message, kod) {
    super(message);
    this.kod = kod;
  }
}

module.exports = aldaa;
