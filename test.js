// import Epub from './dist/epub-parser.js';
import Epub from './lib/epub-parser.js';

// EP.open('./example/testbook.epub')
// .then(console.log).catch(console.error);

const ep = new Epub('./example/testbook.epub');
ep.open().then((ep)=>{
  try{
    // console.log(ep);
    // console.log(ep.getMetadata());
    console.log(ep._opf['metadata']);

    ep.setOpfMeta('dc:say', 'friendster999').then(console.log).catch(console.error);

  } catch(e) {
    console.error(e);
    throw e;
  }
});
