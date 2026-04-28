const nodemailer = require("nodemailer");
// const puppeteer = require('puppeteer');
async function mailIlgeeye(mailKhayag, ilgeekhMail, zurag) {
  let transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true, // use SSL
    auth: {
      user: "zevtabs@gmail.com", // generated ethereal user
      pass: "iqvdwtpnvyrgrzma", // generated ethereal password
    },
  });
  var mail = {
    from: "zevtabs@gmail.com", // sender address
    to: mailKhayag, // list of receivers
    subject: "amarSukh", // Subject line
    //text: ilgeekhMail, // plain text body
    html: ilgeekhMail, // html body
    attachments: zurag
      ? [
          {
            filename: "send.png",
            //path: __dirname + '/../zurag/system/send.png',
            path: zurag,
            //path: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAsgAAALIBa5Ro4AAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAK4SURBVFiFxZdPbExRFMZ/353pmyIk0rSlCaH+hKCSSoSGmTYhFhZiQxBNRGJFWNphZU0kWHchKVuJhDAtG8uWECGIP1VEQpqm80bdYzETYbw35s0UZ3Vzz7nf98u5ufe+Bw2EDQWrbShY3YiGq9s833wQ9Aj0qDSuL1SX+SAp2jPPgCXlqVf4cJn6mE6qVV8HFgS7fzIHWEwq2FWPVH0ApmM1zdUQibfA7gRrcRqNXCtbr2xxNIle8g5IxyPNS8mjieWSFNtd5uMzb4DZMSVTfA0WadvEp1o1k3XAB0eqmAPMIh0eTiJZcwfKR+8psPQPpa94H3ZqD98SA9ituS0EYTu4VrzvQGpDasP7DpyWYPTWRCvyeHuJc2OYfcDsA86Ngf9IMfP+5y2S5YPdoLOIpUBQk0HjUcR4gbOTsqHMW6DjHxlXhH1yiOf/xxyQHjvM7Qce/gf7h5jb75Sbek0q7EHc+Ifmt/HhVuWmXjsAbWGClnAXsoG/bi1dxYc71cdnqDyGhhhuPgV26i/ZnycbnpCwHzxRVZZvPoTsMtA0Q8bfEEeVDS9VJmJvQstntiOuAfMaNJ9E7FU2vB6VjH0L1BveBF1s0BzQhTjzqgCltbahcQDrrpaNBbBBUhgbGwdgkw2SSgxAe1MXje8/wFxam9YlB8D1zIB5KRSvVQXANs8YQBWtdPwi/QnAQFfKw31U+7iRknXAbs1pBzqrWD/B2KFc4YByhQOgXuBBFdhOG569sGYAgq9bYoQmQWdoDbtK90QplCsM48Nu4ATwJRp6OrKj0QDGit9mZAP49HLlCqe1hmLlEvUxrVx4Dp9eVX7UrKJkZe0ASt2F8kelMYJ3WWWL/eqbHI+s/wVkclzZYj/eZTFGytMec/cj6+OEbChYh3ctULhXz08ngN0hjWvuAXunXPg0quY7FQDY/efTIOEAAAAASUVORK5CYII=',
            cid: "zurag", //same cid value as in the html img src
          },
        ]
      : null,
  };
  transporter.sendMail(mail, function (error, info) {});
}

// async function convertHtmlToPdf(htmlContent) {
//   const browser = await puppeteer.launch();
//   const page = await browser.newPage();
//   await page.setContent(htmlContent);
//   const pdfBuffer = await page.pdf();
//   await browser.close();
//   return pdfBuffer;
// }

async function duriinMailIlgeeye(
  user,
  pass,
  host,
  port,
  mailKhayag,
  subject,
  ilgeekhMail,
  gereeniiDugaar
) {
  var tls = {};
  if (host.includes("office365"))
    tls = {
      ciphers: "SSLv3",
    };
  else
    tls = {
      rejectUnauthorized: false,
      // secureProtocol: "TLSv1_method",
      minVersion: "TLSv1",
    };

  // const pdfBuffer = await convertHtmlToPdf(ilgeekhMail);
  let transporter = nodemailer.createTransport({
    host: host ? host : "smtp.zevtabs.mn",
    port: port ? port : 587,
    secureConnection: false,
    tls,
    // pool: true,
    auth: {
      user: user, // generated ethereal user
      pass: pass, // generated ethereal password
    },
  });
  var mail = {
    from: user, // sender address
    to: mailKhayag, // list of receivers
    subject: subject, // Subject line
    // text: "Нэхэмжлэхийг PDF файлаар илгээв.", // plain text body
    html: ilgeekhMail, // html body
    // attachments: [
    //   {
    //     filename: gereeniiDugaar + '.pdf',
    //     content: pdfBuffer
    //   }
    // ],
  };
  transporter.sendMail(mail, function (error, info) {});
}
module.exports = {
  mailIlgeeye,
  duriinMailIlgeeye,
};
