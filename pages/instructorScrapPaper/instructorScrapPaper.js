const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const { generateBarcodes } = require('../../lib/barcodeGenerator');
const error = require('../../prairielib/lib/error');

const bitgener = require('bitgener');
const pdfkit = require('pdfkit');
const sharp = require('sharp');

const pageLimit = 1000;
const charLimit = 45;

const convertBarcodeToSVG = async (barcodes) => {
  const svgs = [];
  for (let i = 0; i < barcodes.length; i++) {
    const result = await bitgener({
      data: barcodes[i],
      type: 'code128',
      output: 'buffer',
      encoding: 'utf8',
      barWidth: 2, // 2 to make barcode wider and more readable with frame reader
      original1DSize: true,
      addQuietZone: true,
      color: '#000',
      bgColor: '#FFF',
      hri: {
        show: true,
        fontSize: 14,
        fontFamily: 'Courier New',
        marginTop: 10,
      },
    });

    svgs.push(result.svg);
  }
  return svgs;
};
const convertImage = async (image) => {
  return sharp(image)
    .png({ quality: 100 })
    .toBuffer({ resolveWithObject: true });
};
const createScrapPaperPdf = async (title, svgs) => {
  let doc = null;

  for (let i = 0; i < svgs.length; i++) {
    if (i === 0) {
      doc = new pdfkit({ size: 'A3' });
    } else {
      doc.addPage({ size: 'A3' });
    }

    doc.fontSize(32).text(title, { align: 'center' });

    const { data, info } = await convertImage(svgs[i]);

    //                        center image             give bottom margin with 40 padding
    doc.image(data, (doc.page.width - info.width) / 2, doc.page.height - info.height - 40);
  }
  return doc;
};

router.get('/', (req, res) => {
  res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

router.post('/', function (req, res, next) {
  if (req.body.__action === 'print_scrap_paper') {
    const numPages = req.body.num_pages;
    const pageLabel = req.body.page_label;

    if (!numPages || numPages < 1 || numPages > pageLimit) {
      ERR(Error(`Must be more than 1 page but not more than ${pageLimit} pages`), next);
      return;
    }
    if (typeof pageLabel !== 'string' || pageLabel.length > charLimit) {
      ERR(Error(`Page label must be valid string less than ${charLimit} characters`), next);
      return;
    }

    generateBarcodes(numPages)
      .then((barcodes) => {
        return convertBarcodeToSVG(barcodes);
      })
      .then((barcodeSVGs) => {
        return createScrapPaperPdf(pageLabel, barcodeSVGs);
      })
      .then((pdf) => {
        res.header(
          'Content-Disposition',
          `attachment; filename=Barcoded scrap paper - ${new Date().toISOString()}.pdf`
        );
        pdf.pipe(res);
        pdf.end();
      })
      .catch((err) => {
        if (ERR(err, next)) return;
      });
  } else {
    return next(
      error.make(400, 'unknown __action', {
        locals: res.locals,
        body: req.body,
      })
    );
  }
});

module.exports = router;
