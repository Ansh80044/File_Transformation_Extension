// class FileTransformer {
//     async transformFile(file, constraints) {
//         console.log(`Starting process for: ${file.name}`);
        
//         // 1. Convert File to Image Bitmap
//         const imgBitmap = await createImageBitmap(file);

//         // 2. Setup Canvas
//         const canvas = document.createElement('canvas');
//         canvas.width = imgBitmap.width;
//         canvas.height = imgBitmap.height;
        
//         const ctx = canvas.getContext('2d');
//         ctx.drawImage(imgBitmap, 0, 0);

//         // 3. Determine Format & Quality
//         // If "forceJpg" is true, use jpeg, otherwise keep original type
//         const targetFormat = constraints.forceJpg ? 'image/jpeg' : file.type;
        
//         // If "compress" is true, lower quality to 0.5, otherwise 0.9
//         const quality = constraints.compress ? 0.5 : 0.9;

//         // 4. Export Blob
//         const blob = await new Promise(resolve => 
//             canvas.toBlob(resolve, targetFormat, quality)
//         );

//         // 5. Create new File object
//         const newName = file.name.split('.')[0] + (targetFormat === 'image/jpeg' ? '.jpg' : '.png');
        
//         return new File([blob], newName, { 
//             type: targetFormat, 
//             lastModified: Date.now() 
//         });
//     }
// }


class FileTransformer {
    async transformFile(file, constraints) {
        console.log(`Starting process for: ${file.name}`);

        // --- SAFETY CHECK ---
        // If the file is NOT an image, stop immediately.
        if (!file.type.startsWith('image/')) {
            throw new Error("Invalid file type! This testing version only supports JPG/PNG images.");
        }

        // 1. Convert File to Image Bitmap (This is where it was crashing before)
        const imgBitmap = await createImageBitmap(file);

        // 2. Setup Canvas
        const canvas = document.createElement('canvas');
        canvas.width = imgBitmap.width;
        canvas.height = imgBitmap.height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgBitmap, 0, 0);

        // 3. Determine Format & Quality
        const targetFormat = constraints.forceJpg ? 'image/jpeg' : file.type;
        const quality = constraints.compress ? 0.5 : 0.9;

        // 4. Export Blob
        const blob = await new Promise(resolve => 
            canvas.toBlob(resolve, targetFormat, quality)
        );

        const newName = file.name.split('.')[0] + (targetFormat === 'image/jpeg' ? '.jpg' : '.png');
        
        return new File([blob], newName, { 
            type: targetFormat, 
            lastModified: Date.now() 
        });
    }
}